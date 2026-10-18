import SwiftUI

/* ---------------- Pakkekort med logo (prompt 21) ---------------- */
// Logo i rekkefølgen butikken → fraktselskapet → bokstav på selskapets farge. Når butikken vises, står
// fraktselskapet som et lite rundt merke nede til høyre. Tittelen er varenavn eller butikk, aldri sporingsnummer.

extension Shipment {
    /// Butikkens domene (logo.domain eller shop_domain).
    var shopLogoDomain: String { logoDomain.isEmpty ? shopDomain : logoDomain }

    /// Fraktselskapets domene (Bring → bring.no osv.).
    var carrierLogoDomain: String {
        if !carrierLogo.isEmpty && !carrierLogo.hasPrefix("/") && !carrierLogo.hasPrefix("http") { return carrierLogo }
        return carrierDomains[carrier.lowercased()] ?? ""
    }

    /// Har pakken en butikklogo (eller et logo-id fra registeret)?
    var hasShopLogo: Bool { !logoId.isEmpty || !shopLogoDomain.isEmpty }

    /// «Komplett · skjerm», «Komplett» eller «Pakke fra Bring». Sporingsnummeret vises bare i detaljene.
    var displayTitle: String {
        if !title.isEmpty { return title }
        let fallbackName: String = "\(carrierName) · \(String(trackingNo.suffix(4)))"
        let item: String = name == fallbackName ? "" : name
        if !shop.isEmpty && !item.isEmpty && item != shop { return shop + " · " + item }
        if !item.isEmpty { return item }
        if !shop.isEmpty { return shop }
        return "Pakke fra " + carrierName
    }
}

/// Logoen på pakkekortet: hvit flate med tynn kant, butikklogo med fraktmerke, ellers fraktselskapets logo.
struct PackageLogo21: View {
    @Environment(\.paper) private var p
    let s: Shipment
    var size: CGFloat = 52
    var radius: CGFloat = 14

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            main
                .frame(width: size, height: size)
                .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).stroke(p.line, lineWidth: 1))
            if s.hasShopLogo {
                PackageCarrierDot21(s: s, size: Swift.max(14, size * 0.35))
                    .offset(x: 4, y: 4)
            }
        }
        .frame(width: size, height: size)
    }

    @ViewBuilder private var main: some View {
        if s.hasShopLogo {
            PaperLogo(domain: s.shopLogoDomain.isEmpty ? nil : s.shopLogoDomain, name: s.shop.isEmpty ? s.carrierName : s.shop,
                      color: s.carrierColor, size: size, radius: radius, logoUrl: shopLogoUrl)
        } else if CarrierMark.known(s.carrier) {
            ZStack {
                RoundedRectangle(cornerRadius: radius, style: .continuous).fill(Color.white)
                CarrierMark(carrier: s.carrier, size: size, radius: radius)
            }
        } else {
            PaperLogo(domain: s.carrierLogoDomain.isEmpty ? nil : s.carrierLogoDomain, name: s.carrierName,
                      color: s.carrierColor, size: size, radius: radius, logoUrl: carrierLogoUrl)
        }
    }

    /// Logo-id fra registeret → filen på serveren (bufret av appen).
    private var shopLogoUrl: String? {
        if s.logoId.isEmpty { return nil }
        let e: String = s.logoId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? s.logoId
        return "/finans/api/logos/file/" + e
    }

    private var carrierLogoUrl: String? {
        let c: String = s.carrierLogo
        return c.hasPrefix("/") ? c : nil
    }
}

/// Lite rundt fraktmerke (18 × 18 på et 52-kort) med hvit kant.
struct PackageCarrierDot21: View {
    let s: Shipment
    let size: CGFloat

    var body: some View {
        Group {
            if CarrierMark.known(s.carrier) {
                CarrierMark(carrier: s.carrier, size: size, radius: size / 2)
            } else {
                PaperLogo(domain: s.carrierLogoDomain.isEmpty ? nil : s.carrierLogoDomain, name: s.carrierName,
                          color: s.carrierColor, size: size, radius: size / 2)
            }
        }
        .frame(width: size, height: size)
        .background(Color.white, in: Circle())
        .clipShape(Circle())
        .overlay(Circle().stroke(Color.white, lineWidth: 2))
    }
}
