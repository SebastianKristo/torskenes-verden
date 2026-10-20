import SwiftUI
import UIKit

/* ---------------- Prompt 42: Abonnementer i Kalender-appen (iPhone og iPad) ---------------- */
// Fasit: Kalender App.dc.html → kalenderen Abonnementer (teal #3d7f8a, kilde Finans) og claude-code-abonnement-kalender.md.
// Måned: chip med logo (12 pt) + navn, tre eller flere trekk samme dag = «3 trekk · 627 kr». Liste: logo, navn, beløp (Plex Mono)
// og merke TREKK / PRØVE / ÅRLIG. Arket: logo, beløp, konto, intervall, neste trekk, Åpne i Finans › og Si opp …
// Ikke redigerbare her – «Endres i Finans → Abonnementer». Varsler: Av · Dagen før · Prøveperioder og årlige (standard).

/* ---------- Logo ---------- */

/// Logoene lastes én gang (sti på serveren med token via KalNet, ellers vanlig URL) og holdes i minnet.
@MainActor
@Observable
final class KalAbLogos42 {
    static let shared: KalAbLogos42 = KalAbLogos42()
    var images: [String: UIImage] = [:]
    @ObservationIgnored private var busy: Set<String> = []

    func load(_ path: String) {
        if path.isEmpty || images[path] != nil || busy.contains(path) { return }
        busy.insert(path)
        Task { @MainActor in
            let d: Data? = await KalAbLogos42.fetch(path)
            if let d, let img = UIImage(data: d) { self.images[path] = img }
        }
    }

    nonisolated static func fetch(_ path: String) async -> Data? {
        if path.hasPrefix("data:") {
            guard let comma = path.firstIndex(of: ",") else { return nil }
            return Data(base64Encoded: String(path[path.index(after: comma)...]))
        }
        if path.hasPrefix("/") { return try? await KalNet.get(path, timeout: 10) }
        guard let u = URL(string: path) else { return nil }
        let pair: (Data, URLResponse)? = try? await URLSession.shared.data(from: u)
        return pair?.0
    }
}

struct KalAbLogo42: View {
    @Environment(\.kal) private var t
    let e: KalEvent
    var size: CGFloat = 12

    var body: some View {
        let path: String = KalAb42.logoPath(e)
        let c: KalCal? = KalStore.shared.cal(e.cal)
        ZStack {
            if let img = KalAbLogos42.shared.images[path] {
                Image(uiImage: img).resizable().scaledToFit()
                    .frame(width: size, height: size)
                    .background(Color.white)
            } else {
                Rectangle().fill(t.calColor(c))
                Text(KalAb42.initial(e)).font(.system(size: size * 0.6, weight: .heavy)).foregroundStyle(Color.white)
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: size * 0.26, style: .continuous))
        .onAppear { KalAbLogos42.shared.load(path) }
        .accessibilityHidden(true)
    }
}

/* ---------- Merke og beløp på raden (Liste, søk, Glimt-kort) ---------- */

struct KalAbBadge42: View {
    @Environment(\.kal) private var t
    let e: KalEvent

    var body: some View {
        let b: String = e.ab42?.badge ?? "TREKK"
        let c: KalCal? = KalStore.shared.cal(e.cal)
        Text(b).font(KalFont.mono(9.5)).tracking(0.6)
            .foregroundStyle(b == "PRØVE" ? Color.white : t.calText(c))
            .padding(.horizontal, 6).padding(.vertical, 1)
            .background(Capsule().fill(b == "PRØVE" ? t.red : t.calTint(c, 0.13)))
    }
}

/* ---------- Arket ---------- */

/// Innholdet i hendelsesarket for et trekk (erstatter Når/Sted/Varsel/Slett).
struct KalAbDetail42: View {
    @Environment(\.kal) private var t
    let e: KalEvent

    var body: some View {
        let x: KalAb42Info = e.ab42 ?? KalAb42Info()
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 12) {
                KalAbLogo42(e: e, size: 44)
                VStack(alignment: .leading, spacing: 3) {
                    Text(title).font(KalFont.serif(26)).foregroundStyle(t.ink).fixedSize(horizontal: false, vertical: true)
                    KalAbBadge42(e: e)
                }
                Spacer(minLength: 0)
            }
            let amt: String = KalAb42.amountText(e)
            if !amt.isEmpty {
                Text(amt).font(KalFont.mono(24)).foregroundStyle(t.ink)
                    .accessibilityLabel("Beløp " + amt)
            }
            VStack(spacing: 0) {
                KalInfoRow(label: e.kind == "trial" ? "Prøveperioden slutter" : "Trekkdato", value: KalD.cap(KalD.fd(KalD.date(e.day))))
                if !x.account.isEmpty { KalInfoRow(label: "Konto", value: x.account) }
                KalInfoRow(label: "Intervall", value: KalAb42.intervalText(e))
                if KalD.valid(x.next) && x.next != e.day {
                    KalInfoRow(label: "Neste trekk", value: KalD.cap(KalD.fd(KalD.date(x.next))))
                }
                if !x.cancelled.isEmpty { KalInfoRow(label: "Status", value: x.cancelled) }
            }
            .overlay(alignment: .top) { Rectangle().fill(t.line2).frame(height: 1) }
            HStack(spacing: 8) {
                KalPill(title: "Åpne i Finans ›") { KalAbOpen42.finans(e) }
                if let u = URL(string: x.cancelUrl), !x.cancelUrl.isEmpty, x.cancelled.isEmpty {
                    KalPill(title: "Si opp …", filled: false) { UIApplication.shared.open(u, options: [:], completionHandler: nil) }
                }
                Spacer(minLength: 0)
            }
            Text("Endres i Finans → Abonnementer").font(KalFont.ui(12.5)).foregroundStyle(t.mut)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var title: String {
        if e.kind == "trial" { return e.title }
        return KalAb42.short(e)
    }
}

enum KalAbOpen42 {
    /// finanshub://abonnement/{subId}; uten Homelab-appen: Subscription OS på web.
    @MainActor static func finans(_ e: KalEvent) {
        KalHaptic.tap()
        guard let u = KalAb42.finansURL(e) else { return }
        UIApplication.shared.open(u, options: [:]) { (ok: Bool) in
            if ok { return }
            Task { @MainActor in
                if let w = KalAb42.webURL() { UIApplication.shared.open(w, options: [:], completionHandler: nil) }
            }
        }
    }
}

/* ---------- Varsler ---------- */

/// Innstillinger → Varsler → Abonnementer: off | day | special (standard: prøveperioder 2 d og 1 d før, årlige 7 d før).
enum KalAbNotify42 {
    static let key: String = "kal.nAb"
    static let options: [KalSegOpt35] = [KalSegOpt35(id: "off", name: "Av"), KalSegOpt35(id: "day", name: "Dagen før"),
                                          KalSegOpt35(id: "special", name: "Prøve og årlige")]

    static var mode: String { UserDefaults.standard.string(forKey: key) ?? "special" }

    static func plans(_ e: KalEvent, now: Date) -> [KalNotify.Plan] {
        guard let x = e.ab42, !e.cont, x.sum == 0 else { return [] }
        let m: String = mode
        if m == "off" { return [] }
        var days: [Int] = []
        if m == "day" { days = [1] }
        if e.kind == "trial" { days = [2, 1] }
        else if x.badge == "ÅRLIG" { days = m == "day" ? [7, 1] : [7] }
        var out: [KalNotify.Plan] = []
        let amt: String = KalAb42.amountText(e)
        for d in days {
            let at: Date = KalD.at(KalD.addKey(e.day, -d), 9 * 60)
            if at <= now { continue }
            let when: String = d == 1 ? "i morgen" : "om " + String(d) + " dager"
            let body: String
            if e.kind == "trial" {
                body = "Prøveperioden slutter " + when + (amt.isEmpty ? "" : " · deretter " + amt)
            } else {
                body = (x.badge == "ÅRLIG" ? "Fornyes " : "Trekkes ") + when + (amt.isEmpty ? "" : " · " + amt) + (x.account.isEmpty ? "" : " · " + x.account)
            }
            out.append(KalNotify.Plan(id: KalNotify.prefix + "ab" + String(d) + "-" + e.id, at: at, title: KalAb42.short(e), body: body,
                                      link: KalNotify.link(e), loc: ""))
        }
        return out
    }
}

struct KalAbNotifyRow42: View {
    @State private var mode: String = KalAbNotify42.mode

    var body: some View {
        KalSegRow35(title: "Abonnementer", sub: "Trekk fra Finans → Abonnementer", options: KalAbNotify42.options, selected: mode) { (v: String) in
            KalHaptic.tap()
            mode = v
            UserDefaults.standard.set(v, forKey: KalAbNotify42.key)
            KalStore.shared.rebuild()
            KalStore.shared.savePrefs(["notifySubscriptions": v])
        }
    }
}

/* ---------- Kontekstmeny (lang-trykk / høyreklikk) ---------- */

/// Rediger · Dupliser · Slett for vanlige hendelser; Åpne i Finans for trekk.
struct KalEventMenu42: View {
    let e: KalEvent

    var body: some View {
        if KalAb42.isSub(e) {
            Button(action: { KalAbOpen42.finans(e) }) { Label("Åpne i Finans", systemImage: "arrow.up.forward.app") }
            Button(action: { KalStore.shared.openDetail(e) }) { Label("Vis", systemImage: "info.circle") }
        } else {
            Button(action: { KalStore.shared.openDetail(e) }) { Label("Rediger", systemImage: "pencil") }
            Button(action: { KalEventMenu42.duplicate(e) }) { Label("Dupliser", systemImage: "plus.square.on.square") }
            Button(action: { KalStore.shared.openDetail(e) }) { Label("Farge for fag …", systemImage: "paintpalette") }
            Button(role: .destructive, action: { KalStore.shared.delete(e) }) { Label("Slett", systemImage: "trash") }
        }
    }

    @MainActor static func duplicate(_ e: KalEvent) {
        let p: KalParsed = KalParsed(title: e.title, cal: e.cal, day: e.day, s: e.s, e: e.allDay ? nil : e.endMin, rem: e.rem, src: "")
        Task { await KalStore.shared.add(p, loc: e.loc, toastPrefix: "Kopierte") }
    }
}
