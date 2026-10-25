import SwiftUI
import UIKit

/* ---------------- Prompt 41: bakgrunn «Oslo» – ekte Oslo-bilder fra lufta som skifter gjennom dagen ---------------- */
// Spesifikasjon: prompts/prompt-41-pakke/claude-code-bakgrunn-oslo-dognet.md, fasit Mobil Papir App.dc.html (BGSET.oslo_*, bgKey).
// – Bare frie Wikimedia Commons-filer (CC BY / CC BY-SA). Getty-bilder er lisensierte og brukes ikke. Har serveren egne filer
//   (assets/bakgrunn/oslo/…), brukes de foran Commons-listen.
// – Tidsrom fra lokal klokke (eller soloppgang/solnedgang fra Vær): morgen = soloppgang−1 t til +3 t, kveld = solnedgang−2 t til
//   +1 t, natt = mørkt, ellers dag. Innenfor tidsrommet byttes bildet hver hele time (time % antall).
// – Sjekker hvert minutt; forhåndslaster neste times bilde 5 min før bytte; bytter med 600 ms krysstoning når det er lastet.
// – Bilder som feiler hoppes over; feiler alle i tidsrommet, brukes dag-settet. Disk-cache i egen URLCache.
// – Kreditering vises i Innstillinger → Tilpass → Bakgrunn («Foto: forfatter · lisens · Wikimedia Commons»), aldri på Hjem.

struct Oslo41Credit: Equatable {
    var file: String
    var text: String
    var url: String
}

@MainActor
@Observable
final class Oslo41 {
    static let shared = Oslo41()

    /// Kreditering for bildet som vises nå (fylles fra Commons-metadata).
    var credit: Oslo41Credit? = nil
    /// Filen som vises nå.
    var currentFile: String = ""
    @ObservationIgnored private var slot: String = ""
    @ObservationIgnored private var ticking: Bool = false
    @ObservationIgnored private var failed: Set<String> = []
    @ObservationIgnored private var prefetched: String = ""
    @ObservationIgnored private var credits: [String: Oslo41Credit] = [:]

    nonisolated static let morning: [String] = ["Oslo_sett_fra_Nesoddtangen,_2020.jpg", "Oslo_from_east_IMG_7642_aerial.JPG", "Oslo_S_aerial.jpg"]
    nonisolated static let day: [String] = ["Oslo_Skyline,_drone.jpg", "Rodeløkka_(7._september_2018).jpg", "Holmenkollen_aerial.jpg",
                                            "2010-10-25_Oslo.jpg", "Operahuset.jpg", "Oslo_S_aerial.jpg"]
    nonisolated static let evening: [String] = ["Bjørvika_-_Oslo,_Norway_2020-12-23.jpg", "Oslo_sunset_-_33885192918.jpg", "Oslo_view.jpg"]
    nonisolated static let night: [String] = ["Oslo_at_night.jpg", "Oslo_night_skyline_2011.jpg", "Oslo_-_Bjørvika_-_2026.jpg"]

    /// Egen disk-cache (60 MB), så bildene ikke lastes ned på nytt hver time.
    nonisolated static let session: URLSession = {
        let c: URLSessionConfiguration = URLSessionConfiguration.default
        c.urlCache = URLCache(memoryCapacity: 8 * 1024 * 1024, diskCapacity: 60 * 1024 * 1024, diskPath: "oslo41")
        c.requestCachePolicy = .returnCacheDataElseLoad
        c.timeoutIntervalForRequest = 20
        return URLSession(configuration: c)
    }()

    nonisolated static func fileURL(_ file: String, width: Int) -> URL? {
        let enc: String = file.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? file
        return URL(string: "https://commons.wikimedia.org/wiki/Special:FilePath/" + enc + "?width=\(width)")
    }

    /// morgen | dag | kveld | natt.
    nonisolated static func period(_ d: Date, sunrise: Date?, sunset: Date?) -> String {
        let cal: Calendar = Calendar.current
        if let rise = sunrise, let set0 = sunset, cal.isDate(rise, inSameDayAs: d) || cal.isDate(set0, inSameDayAs: d) {
            // Samme klokkeslett i dag (Vær kan ha gitt gårsdagens tider).
            let r: Date = Oslo41.today(rise, d)
            let s: Date = Oslo41.today(set0, d)
            if d >= r.addingTimeInterval(-3600) && d < r.addingTimeInterval(3 * 3600) { return "morgen" }
            if d >= s.addingTimeInterval(-2 * 3600) && d < s.addingTimeInterval(3600) { return "kveld" }
            if d < r.addingTimeInterval(-3600) || d >= s.addingTimeInterval(3600) { return "natt" }
            return "dag"
        }
        let h: Int = cal.component(.hour, from: d)
        if h >= 5 && h < 10 { return "morgen" }
        if h >= 10 && h < 16 { return "dag" }
        if h >= 16 && h < 20 { return "kveld" }
        return "natt"
    }

    nonisolated private static func today(_ t: Date, _ d: Date) -> Date {
        let cal: Calendar = Calendar.current
        let hm: DateComponents = cal.dateComponents([.hour, .minute], from: t)
        return cal.date(bySettingHour: hm.hour ?? 0, minute: hm.minute ?? 0, second: 0, of: d) ?? t
    }

    nonisolated static func files41(_ period: String) -> [String] {
        switch period {
        case "morgen": return morning
        case "kveld": return evening
        case "natt": return night
        default: return day
        }
    }

    /// Bildet for et tidspunkt: time % antall i settet.
    nonisolated static func pick(_ d: Date, sunrise: Date?, sunset: Date?) -> (period: String, files: [String]) {
        let per: String = period(d, sunrise: sunrise, sunset: sunset)
        let list: [String] = files41(per)
        let h: Int = Calendar.current.component(.hour, from: d)
        let start: Int = list.isEmpty ? 0 : h % list.count
        let rotated: [String] = Array(list[start...]) + Array(list[..<start])
        return (per, rotated)
    }

    /// true når serveren har egne (lisensierte) Oslo-bilder som skal brukes foran Commons.
    static func serverHasOwn(_ store: Store) -> Bool {
        let u: String = store.bgInfo?.imageUrl ?? ""
        return u.contains("bakgrunn/oslo")
    }

    /// Kalles fra loadPhotoWindow når bakgrunnen er «Oslo». false = serveren har egne Oslo-bilder (vanlig henting brukes).
    func load(_ store: Store) async -> Bool {
        // Les bare hva serveren tilbyr (gradient, vær, ev. egne filer) uten å laste ned bildene dens.
        let size: (w: Int, dpr: Int) = Store.bgPixelWidth()
        if let d = try? await store.api.callAt("/api", "GET", "/background?type=oslo&w=\(size.w)&dpr=\(size.dpr)") {
            let o: [String: Any] = JS.obj(d)
            if JS.str(o, "type") != nil {
                let info: BgInfo = BgInfo(o)
                store.bgInfo = info
                let w: [String: Any]? = JS.dict(o, "weather")
                store.photoWindow = PhotoWindow(["kind": "oslo", "url": info.imageUrl, "credit": info.creditText, "gradient": info.gradient,
                                                 "symbol": JS.str(w, "symbol") ?? ""], kind: "oslo")
            }
        }
        if Oslo41.serverHasOwn(store) { return false }
        slot = ""
        await show(store, Date(), animated: store.photoImage != nil)
        startTicker(store)
        return !currentFile.isEmpty
    }

    private func show(_ store: Store, _ now: Date, animated: Bool) async {
        let w: WeatherX? = store.homeWeather
        let p: (period: String, files: [String]) = Oslo41.pick(now, sunrise: w?.sunrise, sunset: w?.sunset)
        let key: String = p.period + "#" + String(Calendar.current.component(.hour, from: now))
        if key == slot && store.photoImage != nil && !currentFile.isEmpty { return }
        if store.bgPrefs.wifiOnly && !store.onWifi && store.photoImage != nil { return }
        var tryList: [String] = p.files.filter { !failed.contains($0) }
        for f in Oslo41.day where !tryList.contains(f) && !failed.contains(f) { tryList.append(f) }
        for f in tryList {
            guard let img = await Oslo41.fetch(f) else { failed.insert(f); continue }
            guard store.photo == "oslo" else { return }
            slot = key
            currentFile = f
            if animated {
                withAnimation(.easeInOut(duration: 0.6)) { store.photoImage = img }
            } else {
                store.photoImage = img
            }
            store.photoFailed = false
            Store.storeBg("oslo", img)
            await loadCredit(f)
            return
        }
    }

    /// Henter bildet (2000 px, 1280 px som reserve) via disk-cachen.
    nonisolated static func fetch(_ file: String) async -> UIImage? {
        for w in [2000, 1280] {
            guard let u = fileURL(file, width: w) else { continue }
            var r: URLRequest = URLRequest(url: u)
            r.setValue("Homelab/41 (kristo.no)", forHTTPHeaderField: "User-Agent")
            guard let pair = try? await session.data(for: r) else { continue }
            let code: Int = (pair.1 as? HTTPURLResponse)?.statusCode ?? 0
            if code >= 400 { continue }
            if let img = UIImage(data: pair.0) { return img }
        }
        return nil
    }

    /// Hvert minutt: bytt ved ny time / nytt tidsrom, forhåndslast neste times bilde 5 min før.
    private func startTicker(_ store: Store) {
        if ticking { return }
        ticking = true
        Task { @MainActor in
            while store.photo == "oslo" {
                try? await Task.sleep(nanoseconds: 60_000_000_000)
                if store.photo != "oslo" { break }
                if Oslo41.serverHasOwn(store) { continue }
                let now: Date = Date()
                let minute: Int = Calendar.current.component(.minute, from: now)
                if minute >= 55 { await prefetchNext(store, now) }
                await show(store, now, animated: true)
            }
            ticking = false
        }
    }

    private func prefetchNext(_ store: Store, _ now: Date) async {
        if store.bgPrefs.wifiOnly && !store.onWifi { return }
        let next: Date = now.addingTimeInterval(6 * 60)
        let w: WeatherX? = store.homeWeather
        guard let f = Oslo41.pick(next, sunrise: w?.sunrise, sunset: w?.sunset).files.first(where: { !failed.contains($0) }), f != prefetched else { return }
        prefetched = f
        _ = await Oslo41.fetch(f)
    }

    /* ---------- Kreditering (Commons-metadata) ---------- */

    private func loadCredit(_ file: String) async {
        if let c = credits[file] { credit = c; return }
        let page: String = "https://commons.wikimedia.org/wiki/File:" + (file.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? file)
        var c: Oslo41Credit = Oslo41Credit(file: file, text: "Foto: Wikimedia Commons", url: page)
        let title: String = ("File:" + file).addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? file
        if let u = URL(string: "https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata&titles=" + title),
           let pair = try? await Oslo41.session.data(from: u),
           let o = (try? JSONSerialization.jsonObject(with: pair.0)) as? [String: Any],
           let q = o["query"] as? [String: Any], let pages = q["pages"] as? [String: Any],
           let first = pages.values.first as? [String: Any],
           let info = (first["imageinfo"] as? [Any])?.first as? [String: Any],
           let meta = info["extmetadata"] as? [String: Any] {
            let artist: String = Oslo41.plain(((meta["Artist"] as? [String: Any])?["value"] as? String) ?? "")
            let lic: String = ((meta["LicenseShortName"] as? [String: Any])?["value"] as? String) ?? ""
            var parts: [String] = []
            if !artist.isEmpty { parts.append("Foto: " + artist) }
            if !lic.isEmpty { parts.append(lic) }
            parts.append("Wikimedia Commons")
            c.text = parts.joined(separator: " · ")
        }
        credits[file] = c
        credit = c
    }

    /// Fjerner HTML-merker fra Commons-feltet «Artist».
    nonisolated static func plain(_ html: String) -> String {
        var out: String = ""
        var inTag: Bool = false
        for ch in html {
            if ch == "<" { inTag = true; continue }
            if ch == ">" { inTag = false; continue }
            if !inTag { out.append(ch) }
        }
        return out.replacingOccurrences(of: "&amp;", with: "&").replacingOccurrences(of: "&nbsp;", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

/// Liten krediteringslinje under valgt bakgrunn i Innstillinger → Tilpass → Bakgrunn (lenke til filsiden).
struct Bg41CreditLine: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var o: Oslo41 { Oslo41.shared }

    var body: some View {
        if let c = current {
            Button {
                if let u = URL(string: c.url), u.scheme?.hasPrefix("http") == true { UIApplication.shared.open(u, options: [:], completionHandler: nil) }
            } label: {
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text(c.text).font(PF.ui(12)).foregroundStyle(p.mut).multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                    if !c.url.isEmpty { Image(systemName: "arrow.up.right").font(.dyn51(size: 9, weight: .bold)).foregroundStyle(p.mut) }
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Bildekreditering: " + c.text)
        }
    }

    private var current: Oslo41Credit? {
        if store.photo == "cur" { return nil }
        if store.photo == "oslo" && !Oslo41.serverHasOwn(store), let c = o.credit { return c }
        let t: String = store.bgInfo?.creditText ?? ""
        if t.isEmpty { return nil }
        return Oslo41Credit(file: "", text: t, url: store.bgInfo?.creditUrl ?? "")
    }
}
