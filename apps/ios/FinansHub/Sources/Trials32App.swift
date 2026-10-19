import SwiftUI
import UIKit
import UserNotifications

/* ---------------- Prompt 32: Prøveperioder på Hjem (h11) + logoer fra Homelab ---------------- */
// Fasit: Proveperiode Widgets.dc.html → «I appen · Hjem» og Mobil Papir App.dc.html → widget h11 (trwVals()).
// «PRØVEPERIODER · 3 AKTIVE» · logo · navn (Newsreader) · «Avslutt før … · deretter 149 kr/mnd» · stort tall ·
// fremdriftslinje · chips for de neste · Jeg har avsluttet / Behold.

extension Trial31 {
    /// Samme form som widgetene bruker (Shared/Trials32bShared.swift).
    var widget32b: TrialW32b {
        TrialW32b(id: id, name: service, end: endsAt, start: "", price: priceAfter, logo: "", cancelUrl: cancelUrl)
    }
}

extension Trial31Model {
    /// «Jeg har avsluttet» (cancelled) eller «Behold» (kept): lagres, påminnelsene fjernes og widgetene oppdateres.
    func setStatus32b(_ id: String, _ status: String, _ store: Store) {
        if id.isEmpty { return }
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: Trial31Model.ids(id))
        trials.removeAll { (t: Trial31) -> Bool in t.id == id }
        Trials32b.push(active.map { (t: Trial31) -> TrialW32b in t.widget32b })
        Task { @MainActor in
            _ = try? await store.api.callAt("/finans/api", "PATCH", "/subscriptions/trials/" + Cal27Model.enc(id), json: ["status": status], timeout: 15)
            await self.load(store.api)
            if status == "kept" { try? await store.loadSubs() }
        }
    }
}

/* ---------- Logo fra Homelab (bufres i minnet og på disk) ---------- */

@MainActor
@Observable
final class Logo32b {
    static let shared = Logo32b()
    var images: [String: UIImage] = [:]
    private var failed: Set<String> = []
    private var running: Set<String> = []

    private var dir: URL? {
        guard let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else { return nil }
        let d: URL = base.appendingPathComponent("logos32", isDirectory: true)
        if !FileManager.default.fileExists(atPath: d.path) { try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true) }
        return d
    }

    func image(_ domain: String) -> UIImage? { images[domain] }
    func didFail(_ domain: String) -> Bool { failed.contains(domain) }

    /// Biblioteket (LogoRegistry20) først, så /finans/api/logo/<domene> (serveren henter én gang og bufrer).
    func load(_ raw: String, _ api: API) {
        let domain: String = LogoRegistry20.cleanDomain(raw)
        if domain.isEmpty || images[domain] != nil || failed.contains(domain) || running.contains(domain) { return }
        let file: URL? = dir?.appendingPathComponent(domain.replacingOccurrences(of: "/", with: "_") + ".png")
        if let file, let d = try? Data(contentsOf: file), let img = UIImage(data: d) {
            images[domain] = img
            return
        }
        running.insert(domain)
        Task { @MainActor in
            var img: UIImage? = await LogoRegistry20.shared.image(domain: domain, api: api)
            if img == nil, let d = try? await api.bytes("/finans/api/logo/" + domain), let i = UIImage(data: d), i.size.width > 8 { img = i }
            running.remove(domain)
            if let img {
                images[domain] = img
                if let file, let png = img.pngData() { try? png.write(to: file, options: .atomic) }
            } else {
                failed.insert(domain)
            }
        }
    }
}

/// Logo i en rute; bokstavmerket vises mens bildet lastes eller hvis det feiler.
struct LogoBox32b: View {
    @Environment(Store.self) private var store
    @MainActor private var logos: Logo32b { Logo32b.shared }
    let domain: String
    let letter: String
    let color: Color
    var size: CGFloat = 34
    var radius: CGFloat = 10
    var logoSize: CGFloat = 22
    /// Hvit rute med tynn innerkant (Integrasjoner), ellers bare logoen.
    var tile: Bool = true

    var body: some View {
        let d: String = LogoRegistry20.cleanDomain(domain)
        ZStack {
            if let img = logos.image(d) {
                if tile {
                    RoundedRectangle(cornerRadius: radius, style: .continuous).fill(Color.white)
                    Image(uiImage: img).resizable().scaledToFit().frame(width: logoSize, height: logoSize)
                } else {
                    Image(uiImage: img).resizable().scaledToFill().frame(width: size, height: size)
                }
            } else {
                RoundedRectangle(cornerRadius: radius, style: .continuous).fill(color)
                Text(letter).font(PF.ui(size * 0.36, .heavy)).foregroundStyle(Color.white).lineLimit(1).minimumScaleFactor(0.6)
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).stroke(Color(red: 27.0 / 255.0, green: 26.0 / 255.0, blue: 23.0 / 255.0).opacity(0.08), lineWidth: 1))
        .onAppear { if !d.isEmpty { logos.load(d, store.api) } }
    }
}

/* ---------- Hjem-kortet h11 ---------- */

struct Trial32bHomeCard: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Trial31Model { Trial31Model.shared }

    var body: some View {
        let list: [TrialW32b] = m.active.map { (t: Trial31) -> TrialW32b in t.widget32b }.sorted { (a: TrialW32b, b: TrialW32b) -> Bool in a.end < b.end }
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                PLabel(text: list.isEmpty ? "Prøveperioder" : "Prøveperioder · \(list.count) aktive")
                Spacer()
                Button { store.paperGo("abo") } label: { Text("alle ›").font(PF.ui(12)).foregroundStyle(p.mut) }.buttonStyle(.plain)
            }
            if let t = list.first {
                Trial32bMain(t: t)
                if list.count > 1 { Trial32bChips(rest: Array(list.dropFirst().prefix(2))) }
                Trial32bButtons(t: t)
            } else {
                Button { store.subAdding = true } label: {
                    HStack {
                        Text(m.loaded ? "Ingen aktive prøver" : "Henter …").font(PF.ui(13.5)).foregroundStyle(p.mut)
                        Spacer()
                        Text("+ Legg til").font(PF.ui(13, .bold)).foregroundStyle(p.lab)
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .task(id: store.account?.id ?? "") { if !m.loaded { await m.load(store.api) } }
    }
}

struct Trial32bMain: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let t: TrialW32b

    var body: some View {
        let hex: String = t.colorHex()
        let c: Color = hex.isEmpty ? p.ink : Color(hex: hex)
        VStack(alignment: .leading, spacing: 10) {
            Button { store.paperGo("abo") } label: {
                HStack(spacing: 12) {
                    LogoBox32b(domain: Trials32b.domain(t.name), letter: t.initial, color: Color(hex: "#b23a2a"), size: 40, radius: 12, logoSize: 24)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(t.name).font(PF.serif(20, medium: true)).foregroundStyle(p.ink).lineLimit(1)
                        Text("Avslutt før " + t.endShort + " · deretter " + t.priceText).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(1)
                    }
                    Spacer(minLength: 4)
                    VStack(alignment: .trailing, spacing: 3) {
                        Text("\(t.days())").font(PF.serif(28, medium: true)).foregroundStyle(c)
                        Text(t.unit()).font(PF.ui(11.5, .bold)).foregroundStyle(c)
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            GeometryReader { (g: GeometryProxy) in
                ZStack(alignment: .leading) {
                    Capsule().fill(p.line)
                    Capsule().fill(c).frame(width: g.size.width * CGFloat(t.progress()))
                }
            }
            .frame(height: 5)
        }
    }
}

struct Trial32bChips: View {
    @Environment(\.paper) private var p
    let rest: [TrialW32b]

    var body: some View {
        HStack(spacing: 8) {
            ForEach(rest) { (x: TrialW32b) in
                HStack(spacing: 8) {
                    LogoBox32b(domain: Trials32b.domain(x.name), letter: x.initial, color: Color(hex: "#7a7468"), size: 20, radius: 6, logoSize: 14)
                    Text(x.name).font(PF.ui(13, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                    Spacer(minLength: 2)
                    Text("\(x.days()) d").font(PF.ui(12.5, .bold)).foregroundStyle(x.colorHex().isEmpty ? p.ink : Color(hex: x.colorHex()))
                }
                .padding(.horizontal, 12).frame(height: 36)
                .frame(maxWidth: .infinity)
                .background(p.bg, in: Capsule())
            }
        }
    }
}

struct Trial32bButtons: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let t: TrialW32b

    var body: some View {
        HStack(spacing: 8) {
            Button {
                Haptics.shared.success()
                Trial31Model.shared.setStatus32b(t.id, "cancelled", store)
                store.flash(t.name + " er markert som avsluttet")
            } label: {
                Text("Jeg har avsluttet").font(PF.ui(13, .bold)).foregroundStyle(p.bg)
                    .frame(maxWidth: .infinity).frame(height: 38)
                    .background(p.ink, in: Capsule())
            }
            .buttonStyle(.plain)
            Button {
                Haptics.shared.tap()
                Trial31Model.shared.setStatus32b(t.id, "kept", store)
                store.flash(t.name + " flyttes til abonnementer")
            } label: {
                Text("Behold").font(PF.ui(13, .bold)).foregroundStyle(p.ink)
                    .padding(.horizontal, 14).frame(height: 38)
                    .background(p.bg, in: Capsule())
            }
            .buttonStyle(.plain)
        }
    }
}
