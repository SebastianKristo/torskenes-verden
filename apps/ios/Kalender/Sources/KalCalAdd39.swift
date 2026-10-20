import SwiftUI
import UIKit

/* ---------------- Prompt 39: Kalender – Legg til kalender (1c) og «Hvilken kalender er hva?» på iPhone ---------------- */
// Fasit: Kalendere Oppsett.dc.html → 1c (ark: Google-kalender · Abonner med URL · Helligdager, «lag en egen kalender» nederst)
// og 1d (Google-velgeren, her som ark i én kolonne: rad per Google-kalender med Personlig · Bursdager · Ikke bruk).

struct KalCalAdd39Sheet: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    @State private var mode: String = "url"
    @State private var url: String = ""
    @State private var preview: KalIcsPreview39? = nil
    @State private var busy: Bool = false
    @State private var error: String = ""
    @State private var ownName: String = ""
    @State private var ownHex: String = KalCals39.palette[5]
    @State private var country: String = "NO"

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            KalGrabber().padding(.top, 10)
            HStack(alignment: .lastTextBaseline) {
                Text("Legg til kalender").font(KalFont.serif(28)).foregroundStyle(t.ink)
                Spacer()
                Button(action: close) {
                    Text("Avbryt").font(KalFont.ui(15, .semibold)).foregroundStyle(t.mut).frame(minHeight: 44)
                }
                .buttonStyle(.plain)
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    option("g", "Google-kalender", "Velg en kalender fra Google-kontoen din, f.eks. Personlig eller Bursdager.", "G", Color(kalHex: "#4285f4", opacity: 0.14), Color(kalHex: "#2b5d8a"))
                    option("url", "Abonner med URL", "iCal/webcal-lenke, f.eks. timeplanen fra skolen.", "⧉", Color(kalHex: "#2f7a4f", opacity: 0.14), Color(kalHex: "#2f7a4f"))
                    if mode == "url" { urlBox }
                    option("h", "Helligdager", "Fridager for Norge eller et annet land.", "★", t.chip, t.mut)
                    if mode == "h" { holidayBox }
                    if mode == "own" { ownBox } else { ownLink }
                    if !error.isEmpty {
                        Text(error).font(KalFont.ui(12.5)).foregroundStyle(t.acc).fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.bottom, 30)
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
        }
        .padding(.horizontal, 18)
        .frame(maxWidth: .infinity, maxHeight: 640, alignment: .top)
        .background(UnevenRoundedRectangle(topLeadingRadius: 28, topTrailingRadius: 28).fill(t.bg).ignoresSafeArea(edges: .bottom))
        .frame(maxHeight: .infinity, alignment: .bottom)
        .animation(.easeOut(duration: 0.2), value: mode)
        .animation(.easeOut(duration: 0.2), value: preview)
    }

    private func close() {
        KalHaptic.tap()
        withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.3)) { s.cal39AddOpen = false }
    }

    private func option(_ k: String, _ n: String, _ sub: String, _ g: String, _ ib: Color, _ ic: Color) -> some View {
        Button(action: {
            KalHaptic.tap()
            error = ""
            if k == "g" { s.openGMap39() } else { mode = k }
        }) {
            HStack(spacing: 14) {
                Text(g).font(KalFont.ui(16, .heavy)).foregroundStyle(ic)
                    .frame(width: 44, height: 44)
                    .background(RoundedRectangle(cornerRadius: 13).fill(ib))
                VStack(alignment: .leading, spacing: 3) {
                    Text(n).font(KalFont.ui(16, .bold)).foregroundStyle(t.ink)
                    Text(sub).font(KalFont.ui(13)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Text("›").font(KalFont.ui(18)).foregroundStyle(t.mut2)
            }
            .padding(16)
            .background(RoundedRectangle(cornerRadius: 20).fill(t.card))
            .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(mode == k ? t.ink : Color.clear, lineWidth: 2))
            .contentShape(RoundedRectangle(cornerRadius: 20))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(n)
    }

    /// Skole uten adresse får URL-en; ellers blir det et nytt abonnement.
    private var urlTarget: String {
        if let sk = s.cals.first(where: { (c: KalCal) -> Bool in KalCals39.role(c) == "s" }), (sk.p39?.url ?? "").isEmpty, KalCals39.serverKnows {
            return "Legg til Skole"
        }
        if let p = preview, !p.name.isEmpty { return "Legg til «" + p.name + "»" }
        return "Legg til"
    }

    private var urlBox: some View {
        VStack(alignment: .leading, spacing: 8) {
            KalLabel(text: "ICAL-ADRESSE")
            TextField("webcal://tp.uio.no/ical?…", text: $url)
                .font(KalFont.mono(13))
                .foregroundStyle(t.ink)
                .keyboardType(.URL)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled(true)
                .padding(.horizontal, 12)
                .frame(height: 44)
                .background(RoundedRectangle(cornerRadius: 12).fill(t.bg))
                .onChange(of: url) { (_: String, _: String) in preview = nil }
            Text("Finnes i timeplanen på skolens side under «Abonner» eller «Eksporter til kalender». Lim inn, så henter vi navn og fag.")
                .font(KalFont.ui(12.5)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
            if let p = preview, p.error.isEmpty {
                VStack(alignment: .leading, spacing: 3) {
                    Text(p.name.isEmpty ? "Kalender" : p.name).font(KalFont.ui(14, .bold)).foregroundStyle(t.ink)
                    Text(String(p.count) + " hendelser" + (p.subjects.isEmpty ? "" : " · " + p.subjects.prefix(5).joined(separator: ", ")))
                        .font(KalFont.ui(12.5)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 12).fill(t.chip))
            }
            HStack(spacing: 8) {
                KalPill(title: "Lim inn", filled: false, height: 44) {
                    url = (UIPasteboard.general.string ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                }
                KalPill(title: busy ? "Henter …" : (preview == nil ? "Hent" : urlTarget), enabled: !busy && KalCalAPI39.validIcs(url), height: 44) { urlAction() }
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 18).fill(t.card))
    }

    private func urlAction() {
        error = ""
        busy = true
        let u: String = url
        Task {
            if preview == nil {
                let p: KalIcsPreview39 = await KalCalAPI39.preview(u)
                busy = false
                if p.error.isEmpty { preview = p } else { error = p.error }
                return
            }
            let err: String = await s.addUrl39(url: u, name: preview?.name ?? "")
            busy = false
            if err.isEmpty { close() } else { error = err }
        }
    }

    private var holidayBox: some View {
        VStack(alignment: .leading, spacing: 10) {
            KalLabel(text: "LAND")
            HStack(spacing: 6) {
                ForEach(0..<KalCals39.countries.count, id: \.self) { (i: Int) in
                    KalChip(title: KalCals39.countries[i].1, on: country == KalCals39.countries[i].0) { country = KalCals39.countries[i].0 }
                }
            }
            Text("Fridager og merkedager vises som heldag. Beregnes i appen – ingen nett.")
                .font(KalFont.ui(12.5)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
            KalPill(title: "Bruk " + KalCals39.countryName(country), height: 44) { addHolidays() }
                .frame(maxWidth: .infinity)
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 18).fill(t.card))
    }

    private func addHolidays() {
        guard let h = s.cals.first(where: { (c: KalCal) -> Bool in KalCals39.role(c) == "h" }) else { return }
        var d: KalCalDraft39 = s.draft39(h)
        d.visible = true
        d.country = country
        Task {
            let err: String = await s.saveCal39(h, d)
            if err.isEmpty {
                s.showToast("Helligdager for " + KalCals39.countryName(country) + " vises", undo: "")
                close()
            } else {
                error = err
            }
        }
    }

    private var ownLink: some View {
        Button(action: {
            KalHaptic.tap()
            mode = "own"
        }) {
            (Text("Eller ").foregroundColor(t.mut2) + Text("lag en egen kalender").foregroundColor(t.ink).bold() + Text(" som bare finnes i appen").foregroundColor(t.mut2))
                .font(KalFont.ui(13))
                .frame(maxWidth: .infinity)
                .frame(minHeight: 40)
        }
        .buttonStyle(.plain)
    }

    private var ownBox: some View {
        VStack(alignment: .leading, spacing: 10) {
            KalLabel(text: "EGEN KALENDER")
            TextField("Navn", text: $ownName)
                .font(KalFont.ui(15, .semibold))
                .padding(.horizontal, 12)
                .frame(height: 44)
                .background(RoundedRectangle(cornerRadius: 12).fill(t.bg))
            KalFlow(spacing: 8) {
                ForEach(KalCals39.palette, id: \.self) { (h: String) in
                    Button(action: { ownHex = h }) {
                        Circle().fill(Color(kalHex: h)).frame(width: 28, height: 28)
                            .overlay(Circle().strokeBorder(t.ink, lineWidth: h == ownHex ? 2 : 0).padding(-4))
                            .padding(4)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Farge " + h)
                }
            }
            KalPill(title: "Lag kalenderen", enabled: !ownName.trimmingCharacters(in: .whitespaces).isEmpty, height: 44) {
                let n: String = ownName
                let h: String = ownHex
                Task {
                    await s.addCalendar(name: n, hex: h)
                    close()
                }
            }
            .frame(maxWidth: .infinity)
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 18).fill(t.card))
    }
}

/* ---------- 1d på iPhone: Hvilken kalender er hva? ---------- */

struct KalGMap39Sheet: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    @State private var m: KalGMap39? = nil
    @State private var busy: Bool = false
    @State private var error: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            KalGrabber().padding(.top, 10)
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    KalLabel(text: "GOOGLE KALENDER", color: t.red)
                    Text("Hvilken kalender er hva?").font(KalFont.serif(26)).foregroundStyle(t.ink)
                }
                Spacer()
                Button(action: close) {
                    Text("Avbryt").font(KalFont.ui(15, .semibold)).foregroundStyle(t.mut).frame(minHeight: 44)
                }
                .buttonStyle(.plain)
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    content
                }
                .padding(.bottom, 30)
            }
            .scrollIndicators(.hidden)
        }
        .padding(.horizontal, 18)
        .frame(maxWidth: .infinity, maxHeight: 720, alignment: .top)
        .background(UnevenRoundedRectangle(topLeadingRadius: 28, topTrailingRadius: 28).fill(t.bg).ignoresSafeArea(edges: .bottom))
        .frame(maxHeight: .infinity, alignment: .bottom)
        .task { if m == nil { m = await KalGMapAPI39.fetch() } }
    }

    private func close() {
        KalHaptic.tap()
        withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.3)) { s.gmap39Open = false }
    }

    @ViewBuilder private var content: some View {
        if let map = m {
            if !map.connected {
                Text(map.error.isEmpty ? "Google er ikke koblet til ennå." : map.error)
                    .font(KalFont.ui(13.5)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
                KalPill(title: "Koble til Google", height: 44) {
                    Task {
                        if let u = await KalGoogleAPI36.loginURL(returnTo: "/kalender") { _ = await UIApplication.shared.open(u) }
                    }
                }
            } else {
                if !map.email.isEmpty {
                    Text(map.email).font(KalFont.ui(13, .semibold)).foregroundStyle(t.mut)
                }
                VStack(spacing: 0) {
                    ForEach(map.calendars) { (g: KalGMapCal39) in
                        KalGMapRow39(g: g, first: g.id == map.calendars.first?.id) { (r: String) in setRole(g.googleId, r) }
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 4)
                .background(RoundedRectangle(cornerRadius: 18).fill(t.card))
                KalLabel(text: "SLIK BLIR DET I APPEN").padding(.top, 4)
                let rows: [(String, String, String)] = map.summary(s.cals)
                ForEach(0..<rows.count, id: \.self) { (i: Int) in
                    let x: (String, String, String) = rows[i]
                    HStack(alignment: .top, spacing: 10) {
                        Circle().fill(Color(kalHex: x.1)).frame(width: 10, height: 10).padding(.top, 5)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(x.0).font(KalFont.ui(14.5, .bold)).foregroundStyle(t.ink)
                            Text(x.2).font(KalFont.ui(12.5)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer()
                    }
                    .padding(12)
                    .background(RoundedRectangle(cornerRadius: 14).fill(t.card))
                }
                Text("Ikke brukt-kalendere hentes ikke. Nye hendelser du lager i appen havner i Personlig (din primære Google-kalender).")
                    .font(KalFont.ui(12)).foregroundStyle(t.mut2).fixedSize(horizontal: false, vertical: true)
                if !error.isEmpty {
                    Text(error).font(KalFont.ui(12.5)).foregroundStyle(t.acc).fixedSize(horizontal: false, vertical: true)
                }
                KalPill(title: busy ? "Lagrer …" : "Lagre", enabled: !busy, height: 44) { save(map) }
                    .frame(maxWidth: .infinity)
            }
        } else {
            ProgressView().frame(maxWidth: .infinity).padding(30)
        }
    }

    private func setRole(_ gid: String, _ r: String) {
        guard var map = m, let i = map.calendars.firstIndex(where: { (c: KalGMapCal39) -> Bool in c.googleId == gid }) else { return }
        KalHaptic.tap()
        map.calendars[i].role = r
        m = map
    }

    private func save(_ map: KalGMap39) {
        busy = true
        error = ""
        Task {
            let err: String = await KalGMapAPI39.save(map)
            busy = false
            if err.isEmpty {
                s.showToast("Lagret – Google synkes i bakgrunnen", undo: "")
                close()
                await s.load(force: true)
            } else {
                error = err
            }
        }
    }
}

/// Én Google-kalender med segmentet Personlig · Bursdager · Ikke bruk.
struct KalGMapRow39: View {
    @Environment(\.kal) private var t
    let g: KalGMapCal39
    let first: Bool
    let choose: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Circle().fill(Color(kalHex: g.color)).frame(width: 12, height: 12)
                VStack(alignment: .leading, spacing: 1) {
                    Text(g.name).font(KalFont.ui(14.5, .bold)).foregroundStyle(t.ink).lineLimit(1)
                    if !g.access.isEmpty { Text(g.access).font(KalFont.ui(12)).foregroundStyle(t.mut2) }
                }
                Spacer()
            }
            HStack(spacing: 0) {
                seg("p", "Personlig")
                seg("b", "Bursdager")
                seg("x", "Ikke bruk")
            }
            .padding(3)
            .background(RoundedRectangle(cornerRadius: 11).fill(t.chip))
        }
        .padding(.vertical, 12)
        .overlay(alignment: .top) { if !first { Rectangle().fill(t.line2).frame(height: 1) } }
    }

    private func seg(_ k: String, _ n: String) -> some View {
        let on: Bool = g.role == k
        let fill: Color = on ? (k == "x" ? t.card : t.ink) : Color.clear
        let fg: Color = on ? (k == "x" ? t.ink : t.bg) : t.mut
        return Button(action: { choose(k) }) {
            Text(n).font(KalFont.ui(12.5, .bold)).foregroundStyle(fg)
                .frame(maxWidth: .infinity).frame(height: 32)
                .background(RoundedRectangle(cornerRadius: 8).fill(fill))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(g.name + ": " + n)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}
