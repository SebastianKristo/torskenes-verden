import SwiftUI

/* ---------------- Prompt 68: Innstillinger → Brukere og familie ----------------
 Som web (settings65.js, siden «users» i gruppa Husstand, og settings.js usersView65): én side som samler det appen har fra før.
 Rekkefølgen følger web:
 – Familie · Logg inn som (bare admin) og Server · Eier (Konto44Sections), flyttet hit fra Konto
 – Brief og Glimt-figur: Standardfigur per bruker (Glimt52AdminDefaults, bare admin), flyttet hit fra Glimt-innstillingene
 – Familie: Familie og helse, Helse og posisjon (radene som før sto i gruppa «Brukere og familie» i Innstillinger)
 – Helse: Apple Health, Health Connect, Home Assistant · Mobilapp, Hva deles med familien (Health42.rows)
 Konto viser bare en lenkerad hit. Lenker: innst-brukere, finanshub://husstand | brukere-og-familie | brukere,
 og /#/innstillinger/(familie | husstand | brukere-og-familie | users …) fra push. finanshub://familie er fortsatt Familie-fanen. */

enum Users68 {
    static let key: String = "innst-brukere"
    static let name: String = "Brukere og familie"
    static let sub: String = "Logg inn som, figur per bruker, familie, helse og posisjon"

    /// Siste ledd etter /innstillinger/ som betyr denne siden (som ALIAS65 på web).
    static let segments: Set<String> = ["familie", "family", "fam", "husstand", "brukere-og-familie", "users", "brukere", "helse", "barn"]

    /// Push-/weblenke → siden, ellers nil. «familie» o.l. gjelder bare under /innstillinger/ (ellers er det Familie-fanen).
    static func page(_ url: String) -> String? {
        let u: String = url.lowercased()
        if u.contains("brukere-og-familie") || u.contains("husstand") { return key }
        let parts: [String] = u.components(separatedBy: CharacterSet(charactersIn: "/#?&"))
        guard let i = parts.firstIndex(where: { (s: String) -> Bool in s == "innstillinger" || s == "settings" }) else { return nil }
        guard i + 1 < parts.count else { return nil }
        return segments.contains(parts[i + 1]) ? key : nil
    }

    /// finanshub://<side>[/<under>]: true når lenken gjelder denne siden.
    static func isLink(_ page: String, _ sub: String) -> Bool {
        if page == "husstand" || page == "brukere-og-familie" || page == "brukere" || page == "users" { return true }
        let settings: Bool = page == "innstillinger" || page == "settings" || page == "innst"
        return settings && segments.contains(sub)
    }

    /// Lenkeraden på Konto (brukerlista, Logg inn som og eier ligger nå på Brukere og familie).
    @MainActor static func kontoRow(_ store: Store) -> PaperLinkRow {
        let s: String = Konto44.isAdmin(store) ? "Logg inn som, eier av serveren og figur per bruker" : "Eier av serveren, familie og helse"
        return PaperLinkRow(name: name, sub: s, icon: "person.2", tint30: Set30Colors.brukere) { store.paperGo(key) }
    }

    /// Menyraden i Innstillinger (gruppa «Brukere og familie»).
    @MainActor static func menuRow(_ store: Store) -> PaperLinkRow {
        PaperLinkRow(name: name, sub: sub, icon: "person.2") { store.paperGo(key) }
    }

    /// FAMILIE: de to radene som før sto rett i Innstillinger.
    @MainActor static func familyRows(_ store: Store) -> [PaperLinkRow] {
        let h: String = HealthSync.shared.master ? "Apple Health er på · posisjon og bakgrunn" : "Apple Health er av · posisjon og bakgrunn"
        return [
            PaperLinkRow(name: "Familie og helse", sub: "Deling av posisjon, personvern og Apple Helse", icon: "person.2") { store.paperGo("innst-fam") },
            PaperLinkRow(name: "Helse og posisjon", sub: h, icon: "heart.text.square") { store.paperGo("innst-helse") },
        ]
    }
}

/// Innstillinger → Brukere og familie (innst-brukere).
struct Users68Page: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Konto44Sections()
            Users68Note(admin: Konto44.isAdmin(store))
            Users68Figures()
            Users68Group(title: "Familie", rows: Users68.familyRows(store), offset: 4)
            Users68Group(title: "Helse", rows: Health42.rows(store, p), offset: 5)
        }
    }
}

struct Users68Note: View {
    @Environment(\.paper) private var p
    let admin: Bool

    private var text: String {
        if admin { return "Admin kan legge til og fjerne brukere. Bruker ser dashbordet og styrer egen totrinnsbekreftelse." }
        return "Brukere legges til av administrator. Du styrer egen totrinnsbekreftelse."
    }

    var body: some View {
        Text(text).font(PF.ui(12)).foregroundStyle(p.mut)
            .padding(.horizontal, 6).padding(.top, 6)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// BRIEF OG GLIMT-FIGUR (bare admin): standardfigur per bruker.
struct Users68Figures: View {
    @Environment(Store.self) private var store

    var body: some View {
        if store.account?.role == "admin" {
            VStack(alignment: .leading, spacing: 6) {
                PLabel(text: "Brief og Glimt-figur").padding(.leading, 4).padding(.top, 14)
                Glimt52AdminDefaults()
            }
        }
    }
}

struct Users68Group: View {
    let title: String
    let rows: [PaperLinkRow]
    let offset: Int

    private var shifted: [PaperLinkRow] {
        rows.map { (r: PaperLinkRow) -> PaperLinkRow in
            var x: PaperLinkRow = r
            x.colorOffset = offset
            return x
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            PLabel(text: title).padding(.leading, 4).padding(.top, 14).padding(.bottom, 6)
            PaperLinkList(rows: shifted)
        }
    }
}
