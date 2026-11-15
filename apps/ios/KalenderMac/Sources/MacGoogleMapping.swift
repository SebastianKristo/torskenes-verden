import SwiftUI
import AppKit

/* ---------------- Prompt 39: Kalender for Mac – «Hvilken kalender er hva?» (1d) ---------------- */
// Fasit: Kalendere Oppsett.dc.html → 1d. Venstre: alle Google-kalendere (farge, navn, tilgang) med segmentet
// Personlig · Bursdager · Ikke bruk, under: kortene Skole (URL, status) og Helligdager (land). Høyre: SLIK BLIR DET I APPEN
// (oppdateres live), info og Avbryt / Lagre. Lagre → PUT /api/kalender/google/mapping {map} → full synk i bakgrunnen.
// Åpnes første gang Google er koblet til, fra «Endre kobling» (sidemenyen) og fra Innstillinger → Google Kalender.

struct MacGoogleMap39Sheet: View {
    @Environment(\.mk) private var t
    @Binding var open: Bool
    @ObservedObject var store: MacStore = MacStore.shared
    @State private var m: KalGMap39? = nil
    @State private var busy: Bool = false
    @State private var error: String = ""
    @State private var country: String = "NO"

    var body: some View {
        HStack(spacing: 0) {
            left
                .frame(minWidth: 0, maxWidth: .infinity, alignment: .topLeading)
            right
                .frame(width: 300)
        }
        .frame(width: 960, height: 640)
        .background(t.bg)
        .task {
            if m == nil {
                let r: KalGMap39 = await KalGMapAPI39.fetch()
                m = r
                country = r.country
            }
        }
    }

    /* ---------- Venstre ---------- */

    private var left: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    MacLabel(text: "GOOGLE KALENDER", color: t.red)
                    Text("Hvilken kalender er hva?").font(MacFont.serif(30)).foregroundColor(t.ink)
                }
                Spacer()
                account
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    list
                    HStack(alignment: .top, spacing: 12) {
                        schoolCard
                        holidayCard
                    }
                }
            }
        }
        .padding(.horizontal, 28)
        .padding(.vertical, 26)
    }

    @ViewBuilder private var account: some View {
        if let map = m, map.connected, !map.email.isEmpty {
            HStack(spacing: 10) {
                Text(String(map.email.prefix(1)).uppercased()).font(MacFont.ui(11, .heavy)).foregroundColor(t.bg)
                    .frame(width: 28, height: 28)
                    .background(Circle().fill(t.ink))
                Text(map.email).font(MacFont.ui(13)).foregroundColor(t.ink).lineLimit(1)
                Button("Bytt") { login() }
                    .buttonStyle(.plain)
                    .font(MacFont.ui(13, .bold))
                    .foregroundColor(t.red)
            }
            .padding(.leading, 6).padding(.trailing, 12).padding(.vertical, 6)
            .background(Capsule().fill(t.card))
        }
    }

    @ViewBuilder private var list: some View {
        if let map = m {
            if !map.connected {
                VStack(alignment: .leading, spacing: 10) {
                    Text(map.error.isEmpty ? "Google er ikke koblet til ennå. Logg inn med Google i Homelab (åpnes i nettleseren)." : map.error)
                        .font(MacFont.ui(13)).foregroundColor(t.mut).fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 8) {
                        Button("Koble til Google") { login() }
                        Button("Oppdater") { reload() }
                    }
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 18).fill(t.card))
            } else {
                VStack(spacing: 0) {
                    HStack(spacing: 12) {
                        MacLabel(text: "I GOOGLE-KONTOEN").frame(maxWidth: .infinity, alignment: .leading)
                        MacLabel(text: "BRUK SOM").frame(width: 300, alignment: .leading)
                    }
                    .padding(.vertical, 10)
                    ForEach(map.calendars) { (g: KalGMapCal39) in
                        MacGMapRow39(g: g) { (r: String) in setRole(g.googleId, r) }
                    }
                    if map.calendars.isEmpty {
                        Text("Fant ingen kalendere i Google-kontoen.").font(MacFont.ui(12.5)).foregroundColor(t.mut)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 14)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 2)
                .background(RoundedRectangle(cornerRadius: 18).fill(t.card))
            }
        } else {
            HStack(spacing: 8) {
                ProgressView().controlSize(.small)
                Text("Henter Google-kalendere …").font(MacFont.ui(12.5)).foregroundColor(t.mut)
            }
            .padding(16)
        }
    }

    private var schoolCal: KalCal? { store.cals.first { (c: KalCal) -> Bool in KalCals39.role(c) == "s" } }
    private var holidayCal: KalCal? { store.cals.first { (c: KalCal) -> Bool in KalCals39.role(c) == "h" } }

    private var schoolCard: some View {
        let sc: KalCal? = schoolCal
        var url: String = m?.schoolUrl ?? ""
        if url.isEmpty { url = sc?.p39?.url ?? "" }
        var status: String = m?.schoolStatus ?? ""
        if status.isEmpty, let c = sc {
            status = String(c.count) + " hendelser"
            let lf: String = c.p39?.lastFetched ?? ""
            if !lf.isEmpty { status += " · oppdatert " + KalCals39.shortTime(lf) }
            status += " · " + KalCals39.intervalName(c.p39?.interval ?? "").lowercased()
        }
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Circle().fill(Color(kalHex: sc?.hex ?? "#2f7a4f")).frame(width: 12, height: 12)
                Text(sc?.name ?? "Skole").font(MacFont.ui(14.5, .bold)).foregroundColor(t.ink)
                MacBadge39(badge: "URL")
            }
            Text(url.isEmpty ? "Ingen adresse – legg til i sidemenyen" : url)
                .font(MacFont.mono(12)).foregroundColor(t.ink2).lineLimit(1).truncationMode(.middle)
                .padding(.horizontal, 10)
                .frame(maxWidth: .infinity, minHeight: 38, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 10).fill(t.bg))
            Text(status).font(MacFont.ui(12)).foregroundColor(t.mut2).lineLimit(2)
        }
        .padding(.horizontal, 16).padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 18).fill(t.card))
    }

    private var holidayCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Circle().fill(Color(kalHex: holidayCal?.hex ?? "#a39d90")).frame(width: 12, height: 12)
                Text("Helligdager").font(MacFont.ui(14.5, .bold)).foregroundColor(t.ink)
                MacBadge39(badge: "INNEBYGD")
            }
            Picker("", selection: $country) {
                ForEach(0..<KalCals39.countries.count, id: \.self) { (i: Int) in
                    Text(KalCals39.countries[i].1).tag(KalCals39.countries[i].0)
                }
            }
            .labelsHidden()
            .frame(maxWidth: .infinity, minHeight: 38)
            Text("Fridager og merkedager · vises som heldag").font(MacFont.ui(12)).foregroundColor(t.mut2)
        }
        .padding(.horizontal, 16).padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 18).fill(t.card))
    }

    /* ---------- Høyre ---------- */

    private var right: some View {
        VStack(alignment: .leading, spacing: 12) {
            MacLabel(text: "SLIK BLIR DET I APPEN")
            let rows: [(String, String, String)] = summaryRows
            ForEach(0..<rows.count, id: \.self) { (i: Int) in
                MacGMapSummary39(name: rows[i].0, hex: rows[i].1, text: rows[i].2)
            }
            Spacer(minLength: 8)
            Text("Ikke brukt-kalendere hentes ikke. Nye hendelser du lager i appen havner i Personlig (din primære Google-kalender).")
                .font(MacFont.ui(12)).foregroundColor(t.mut2).fixedSize(horizontal: false, vertical: true)
            if !error.isEmpty {
                Text(error).font(MacFont.ui(12)).foregroundColor(t.acc).fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: 8) {
                Button(action: { open = false }) {
                    Text("Avbryt").font(MacFont.ui(13.5, .bold)).foregroundColor(t.ink)
                        .frame(maxWidth: .infinity).frame(height: 42)
                        .overlay(Capsule().strokeBorder(t.line, lineWidth: 1))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .keyboardShortcut(.cancelAction)
                Button(action: { save() }) {
                    Text(busy ? "Lagrer …" : "Lagre").font(MacFont.ui(13.5, .bold)).foregroundColor(t.bg)
                        .frame(maxWidth: .infinity).frame(height: 42)
                        .background(Capsule().fill(t.ink))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .keyboardShortcut(.defaultAction)
                .disabled(busy || m == nil)
            }
        }
        .padding(.horizontal, 22)
        .padding(.vertical, 26)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(t.chip)
    }

    private var summaryRows: [(String, String, String)] {
        guard var map = m else { return [] }
        map.country = country
        return map.summary(store.cals)
    }

    /* ---------- Handlinger ---------- */

    private func setRole(_ gid: String, _ r: String) {
        guard var map = m, let i = map.calendars.firstIndex(where: { (c: KalGMapCal39) -> Bool in c.googleId == gid }) else { return }
        map.calendars[i].role = r
        m = map
    }

    private func reload() {
        Task {
            let r: KalGMap39 = await KalGMapAPI39.fetch()
            m = r
            country = r.country
        }
    }

    private func login() {
        Task {
            if let u = await KalGoogleAPI36.loginURL(returnTo: "/kalender") {
                await MainActor.run { _ = NSWorkspace.shared.open(u) }
            } else {
                error = "Fikk ikke åpnet innloggingen. Logg inn med Google i Homelab → Innstillinger → Integrasjoner."
            }
        }
    }

    private func save() {
        guard let map = m else { return }
        busy = true
        error = ""
        let c: String = country
        let changedCountry: Bool = c != map.country
        let hid: String? = holidayCal?.id
        Task {
            var err: String = ""
            if map.connected { err = await KalGMapAPI39.save(map) }
            if changedCountry, let hid { await KalGMapAPI39.saveCountry(hid, c) }
            busy = false
            if err.isEmpty {
                UserDefaults.standard.set(true, forKey: "mac.gmap39seen")
                store.showToast("Lagret – Google synkes i bakgrunnen", undo: "")
                open = false
                await store.load(force: true)
            } else {
                error = err
            }
        }
    }
}

/// Én Google-kalender med segmentet.
struct MacGMapRow39: View {
    @Environment(\.mk) private var t
    let g: KalGMapCal39
    let choose: (String) -> Void

    var body: some View {
        HStack(spacing: 12) {
            HStack(spacing: 10) {
                Circle().fill(Color(kalHex: g.color)).frame(width: 12, height: 12)
                VStack(alignment: .leading, spacing: 1) {
                    Text(g.name).font(MacFont.ui(14.5, .bold)).foregroundColor(t.ink).lineLimit(1)
                    if !g.access.isEmpty { Text(g.access).font(MacFont.ui(12)).foregroundColor(t.mut2).lineLimit(1) }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: 0) {
                seg("p", "Personlig")
                seg("b", "Bursdager")
                seg("x", "Ikke bruk")
            }
            .padding(3)
            .background(RoundedRectangle(cornerRadius: 11).fill(t.chip))
            .frame(width: 300)
        }
        .frame(minHeight: 58)
        .overlay(alignment: .top) { Rectangle().fill(t.line2).frame(height: 1) }
    }

    private func seg(_ k: String, _ n: String) -> some View {
        let on: Bool = g.role == k
        let fill: Color = on ? (k == "x" ? t.card : t.ink) : Color.clear
        let fg: Color = on ? (k == "x" ? t.ink : t.bg) : t.mut
        return Button(action: { choose(k) }) {
            Text(n).font(MacFont.ui(12.5, .bold)).foregroundColor(fg)
                .frame(maxWidth: .infinity).frame(height: 32)
                .background(RoundedRectangle(cornerRadius: 8).fill(fill).shadow(color: Color.black.opacity(on && k == "x" ? 0.12 : 0), radius: 1.5, y: 1))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(g.name + ": " + n)
    }
}

struct MacGMapSummary39: View {
    @Environment(\.mk) private var t
    let name: String
    let hex: String
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                Circle().fill(Color(kalHex: hex)).frame(width: 10, height: 10)
                Text(name).font(MacFont.ui(14.5, .bold)).foregroundColor(t.ink)
            }
            Text(text).font(MacFont.ui(12.5)).foregroundColor(t.mut).fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 14).fill(t.card))
    }
}

/// GOOGLE / URL / INNEBYGD.
struct MacBadge39: View {
    @Environment(\.mk) private var t
    let badge: String

    var body: some View {
        Text(badge).font(MacFont.mono(10)).foregroundColor(fg)
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(RoundedRectangle(cornerRadius: 5).fill(bg))
            .fixedSize()
    }

    private var fg: Color {
        switch badge {
        case "GOOGLE": return t.dark ? Color(kalHex: "#9cc2ee") : Color(kalHex: "#2b5d8a")
        case "URL": return t.dark ? Color(kalHex: "#8fd4a8") : Color(kalHex: "#2f7a4f")
        default: return t.mut
        }
    }

    private var bg: Color {
        switch badge {
        case "GOOGLE": return Color(kalHex: "#4285f4", opacity: 0.12)
        case "URL": return Color(kalHex: "#2f7a4f", opacity: 0.12)
        default: return t.chip
        }
    }
}
