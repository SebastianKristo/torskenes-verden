import SwiftUI
import AppKit
import CryptoKit

/* ---------------- Prompt 43: Kalender for Mac – oppdater appen fra appen (egen oppdaterer, ikke Sparkle) ---------------- */
// Fasit: design/Kalender Oppdatering.dc.html (variant mac), brukt i Kalender Mac.dc.html (Kalender → Se etter oppdateringer …
// og Innstillinger → Oppdateringer). Ingen nye avhengigheter og ingen EdDSA-nøkler i release-workflowen:
//   1. GET <server>/api/apps/kalender/latest?platform=mac&channel=stabil|beta → {version, build, size, url, sha256, notes[], publishedAt}
//      (serveren leser GitHub-releasene og SHA256SUMS.txt; uinnlogget OK).
//   2. Last ned DMG-en (fremdrift, MB av MB, fart, Avbryt) til appens Caches.
//   3. SHA-256 av fila må være lik `sha256` fra serveren, ellers slettes den («Oppdateringen kunne ikke bekreftes og ble slettet.»).
//   4. «Installer og start på nytt»: DMG-en monteres (hdiutil, utenfor hovedtråden), Kalender.app i den sjekkes (samme bundle-id),
//      et lite skript venter til appen har avsluttet, bytter appen (ditto → mv), avmonterer og åpner den nye.
//   Appen er ad hoc-signert: macOS (Gatekeeper) kan spørre første gang den nye versjonen åpnes – det står i vinduet.
//   Går monteringen eller byttet ikke (sandkassen, appen ligger et sted vi ikke kan skrive), åpnes DMG-en i Finder i stedet.
// Alt nettverk, all hashing og alle prosesser kjører utenfor hovedtråden (ingen frysing).

struct MacRelease43: Equatable {
    var version: String
    var build: Int
    var size: Int64
    var url: String
    var sha256: String
    var notes: [String]
    var publishedAt: String

    var file: String {
        let n: String = URL(string: url)?.lastPathComponent ?? ""
        return n.isEmpty ? "Kalender-" + version + ".dmg" : n
    }

    /// «Kalender 1.1 (17)»
    var label: String { "Kalender " + version + (build > 0 ? " (" + String(build) + ")" : "") }
}

enum MacUpdPhase43: String {
    case idle, check, none, avail, dl, ready, inst, done, err
}

@MainActor
final class MacUpdater43: ObservableObject {
    static let shared: MacUpdater43 = MacUpdater43()

    @Published var phase: MacUpdPhase43 = .idle
    @Published var rel: MacRelease43? = nil
    @Published var got: Int64 = 0
    @Published var total: Int64 = 0
    /// Byte per sekund.
    @Published var speed: Double = 0
    @Published var message: String = ""
    /// Serveren har ikke endepunktet (404): «Åpne siste release» på GitHub.
    @Published var noServer: Bool = false
    @Published var lastCheck: Double = UserDefaults.standard.double(forKey: "mac43.updLast")
    @Published var auto: Bool = (UserDefaults.standard.object(forKey: "mac43.updAuto") as? Bool) ?? true {
        didSet { UserDefaults.standard.set(auto, forKey: "mac43.updAuto") }
    }
    @Published var autoDl: Bool = (UserDefaults.standard.object(forKey: "mac43.updAutoDl") as? Bool) ?? true {
        didSet { UserDefaults.standard.set(autoDl, forKey: "mac43.updAutoDl") }
    }
    /// stabil | beta
    @Published var channel: String = UserDefaults.standard.string(forKey: "mac43.updCh") ?? "stabil" {
        didSet {
            UserDefaults.standard.set(channel, forKey: "mac43.updCh")
            if oldValue != channel && phase != .dl && phase != .inst { phase = .idle }
        }
    }

    static let releasesPage: String = "https://github.com/SebastianKristo/torskenes-verden/releases/latest"

    private var session: URLSession? = nil
    private var task: URLSessionDownloadTask? = nil
    private var startedAt: Date = Date()
    /// Nedlastingen som gjelder (svar fra en avbrutt, eldre nedlasting ignoreres).
    private var gen: Int = 0
    private(set) var dmg: URL? = nil

    init() {
        // Etter en installasjon: stemmer versjonen med den vi installerte?
        let d: UserDefaults = UserDefaults.standard
        if let expect = d.string(forKey: "mac43.updExpect") {
            d.removeObject(forKey: "mac43.updExpect")
            if expect == MacUpdater43.currentKey {
                phase = .done
            } else {
                phase = .err
                message = "Oppdateringen ble ikke fullført. Åpne DMG-en og dra Kalender til Programmer."
            }
            let dir: URL = MacUpdater43.cacheDir()
            Task.detached(priority: .utility) { try? FileManager.default.removeItem(at: dir) }
        }
    }

    /* ---------- Versjon ---------- */

    nonisolated static var currentVersion: String {
        (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String) ?? "?"
    }

    nonisolated static var currentBuild: Int {
        Int((Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String) ?? "") ?? 0
    }

    nonisolated static var currentKey: String { currentVersion + "|" + String(currentBuild) }

    /// «Kalender 1.0 (14) · macOS»
    var currentLabel: String {
        let b: Int = MacUpdater43.currentBuild
        return "Kalender " + MacUpdater43.currentVersion + (b > 0 ? " (" + String(b) + ")" : "") + " · macOS"
    }

    nonisolated static func isNewer(_ r: MacRelease43, version: String, build: Int) -> Bool {
        let x: [Int] = r.version.split(separator: ".").map { (p: Substring) -> Int in Int(p) ?? 0 }
        let y: [Int] = version.split(separator: ".").map { (p: Substring) -> Int in Int(p) ?? 0 }
        let n: Int = Swift.max(x.count, y.count)
        for i in 0..<n {
            let p: Int = i < x.count ? x[i] : 0
            let q: Int = i < y.count ? y[i] : 0
            if p != q { return p > q }
        }
        return r.build > 0 && build > 0 && r.build > build
    }

    /* ---------- 1. Se etter oppdateringer ---------- */

    /// Én gang om dagen ved oppstart (når «Se etter oppdateringer automatisk» er på). Laster ned i bakgrunnen hvis valgt.
    func autoCheck() async {
        // «✓ oppdatert» etter en installasjon skal stå til brukeren har sett det.
        if !auto || phase == .done || phase == .err { return }
        if Date().timeIntervalSince1970 - lastCheck < 20 * 3600 { return }
        await check(quiet: true)
        if phase == .avail && autoDl { download() }
    }

    func check(quiet: Bool = false) async {
        if phase == .dl || phase == .inst { return }
        if !quiet { phase = .check }
        message = ""
        noServer = false
        let path: String = "/api/apps/kalender/latest?platform=mac&channel=" + KalNet.enc(channel)
        var bases: [String] = MacSession.bases
        if bases.isEmpty { bases = [KalAuth41.defaultBase] }
        do {
            let d: Data = try await KalNet.send("GET", path, timeout: 8, bases: bases)
            let now: Double = Date().timeIntervalSince1970
            lastCheck = now
            UserDefaults.standard.set(now, forKey: "mac43.updLast")
            guard let r = MacUpdater43.parse(d, base: bases.first ?? "") else {
                phase = quiet ? .idle : .err
                message = "Uventet svar fra serveren."
                return
            }
            if MacUpdater43.isNewer(r, version: MacUpdater43.currentVersion, build: MacUpdater43.currentBuild) {
                rel = r
                phase = .avail
            } else {
                rel = nil
                phase = quiet ? .idle : .none
            }
        } catch let e as KalNetError {
            if quiet {
                phase = .idle
                return
            }
            phase = .err
            if e.status == 404 {
                noServer = true
                message = "Serveren har ingen oppdateringsinformasjon ennå."
            } else {
                message = e.status == 0 ? "Fikk ikke kontakt med serveren." : e.message
            }
        } catch {
            phase = quiet ? .idle : .err
            message = error.localizedDescription
        }
    }

    nonisolated static func parse(_ d: Data, base: String) -> MacRelease43? {
        guard let o0 = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] else { return nil }
        let o: [String: Any] = (o0["latest"] as? [String: Any]) ?? o0
        let v: String = (o["version"] as? String) ?? ""
        var url: String = (o["url"] as? String) ?? ""
        if v.isEmpty || url.isEmpty { return nil }
        if url.hasPrefix("/") { url = KalAuth41.trim(base) + url }
        var notes: [String] = []
        for n in (o["notes"] as? [Any]) ?? [] {
            if let s = n as? String { notes.append(s) } else if let m = n as? [String: Any], let s = (m["t"] as? String) ?? (m["text"] as? String) { notes.append(s) }
        }
        let build: Int = (o["build"] as? Int) ?? Int((o["build"] as? String) ?? "") ?? 0
        let size: Int64 = (o["size"] as? NSNumber)?.int64Value ?? 0
        let sha: String = ((o["sha256"] as? String) ?? "").lowercased().trimmingCharacters(in: .whitespaces)
        return MacRelease43(version: v.hasPrefix("v") ? String(v.dropFirst()) : v, build: build, size: size, url: url, sha256: sha,
                            notes: notes, publishedAt: (o["publishedAt"] as? String) ?? "")
    }

    func later() {
        phase = .idle
    }

    func openReleasePage() {
        if let u = URL(string: MacUpdater43.releasesPage) { _ = NSWorkspace.shared.open(u) }
    }

    /* ---------- 2. Last ned ---------- */

    nonisolated static func cacheDir() -> URL {
        let base: URL = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first ?? FileManager.default.temporaryDirectory
        return base.appendingPathComponent("KalenderOppdatering43", isDirectory: true)
    }

    func download() {
        guard let r = rel, let url = URL(string: r.url) else { return }
        if r.sha256.count != 64 {
            phase = .err
            message = "Oppdateringen kunne ikke bekreftes (mangler sjekksum) og ble ikke lastet ned."
            return
        }
        cancelDownload(silent: true)
        gen += 1
        let g: Int = gen
        phase = .dl
        got = 0
        total = r.size
        speed = 0
        message = ""
        startedAt = Date()
        let dest: URL = MacUpdater43.cacheDir().appendingPathComponent(r.file)
        let del: MacUpdDelegate43 = MacUpdDelegate43(dest: dest)
        del.onProgress = { (w: Int64, t: Int64) in
            Task { @MainActor in MacUpdater43.shared.progress(w, t, g) }
        }
        del.onDone = { (file: URL?, err: String?) in
            Task { @MainActor in MacUpdater43.shared.finished(file, err, g) }
        }
        let cfg: URLSessionConfiguration = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 30
        let s: URLSession = URLSession(configuration: cfg, delegate: del, delegateQueue: nil)
        session = s
        let t: URLSessionDownloadTask = s.downloadTask(with: url)
        task = t
        t.resume()
    }

    func cancelDownload(silent: Bool = false) {
        gen += 1
        task?.cancel()
        task = nil
        session?.invalidateAndCancel()
        session = nil
        if !silent { phase = rel == nil ? .idle : .avail }
    }

    private func progress(_ w: Int64, _ t: Int64, _ g: Int) {
        if phase != .dl || g != gen { return }
        got = w
        if t > 0 { total = t }
        let dt: Double = Date().timeIntervalSince(startedAt)
        if dt > 0.3 { speed = Double(w) / dt }
    }

    private func finished(_ file: URL?, _ err: String?, _ g: Int) {
        if g != gen { return }
        session?.finishTasksAndInvalidate()
        session = nil
        task = nil
        if phase != .dl { return }
        guard let file else {
            phase = .err
            message = err ?? "Nedlastingen ble avbrutt."
            return
        }
        // 3. SHA-256 utenfor hovedtråden.
        let want: String = rel?.sha256 ?? ""
        message = "Sjekker signaturen …"
        Task.detached(priority: .userInitiated) {
            let have: String = MacUpdater43.sha256(file) ?? ""
            let ok: Bool = !want.isEmpty && have == want
            if !ok { try? FileManager.default.removeItem(at: file) }
            await MainActor.run {
                let u: MacUpdater43 = MacUpdater43.shared
                if ok {
                    u.dmg = file
                    u.message = ""
                    u.phase = .ready
                } else {
                    u.dmg = nil
                    u.phase = .err
                    u.message = "Oppdateringen kunne ikke bekreftes og ble slettet."
                }
            }
        }
    }

    nonisolated static func sha256(_ url: URL) -> String? {
        guard let h = try? FileHandle(forReadingFrom: url) else { return nil }
        defer { try? h.close() }
        var hasher: SHA256 = SHA256()
        while true {
            let d: Data = h.readData(ofLength: 1 << 20)
            if d.isEmpty { break }
            hasher.update(data: d)
        }
        return hasher.finalize().map { (b: UInt8) -> String in String(format: "%02x", b) }.joined()
    }

    /* ---------- 4. Installer og start på nytt ---------- */

    func install() {
        guard let dmg, let r = rel else { return }
        phase = .inst
        message = ""
        let target: URL = Bundle.main.bundleURL
        let pid: Int32 = ProcessInfo.processInfo.processIdentifier
        let bid: String = Bundle.main.bundleIdentifier ?? "no.kristo.kalender.mac"
        let expect: String = r.version + "|" + String(r.build)
        Task.detached(priority: .userInitiated) {
            let err: String? = MacUpdater43.prepare(dmg: dmg, target: target, pid: pid, bundleId: bid)
            await MainActor.run {
                let u: MacUpdater43 = MacUpdater43.shared
                if let err {
                    // Reserve: Finder monterer DMG-en og viser «Dra Kalender til Programmer».
                    u.phase = .err
                    u.message = err + " DMG-en åpnes – dra Kalender til Programmer."
                    _ = NSWorkspace.shared.open(dmg)
                    return
                }
                UserDefaults.standard.set(r.build > 0 ? expect : r.version + "|" + String(MacUpdater43.currentBuild), forKey: "mac43.updExpect")
                UserDefaults.standard.synchronize()
                NSApp.terminate(nil)
            }
        }
    }

    /// «Last ned og installer i bakgrunnen»: en ferdig sjekket versjon installeres når appen avslutter.
    func installOnQuitIfReady() {
        guard autoDl, phase == .ready, let dmg, let r = rel else { return }
        let err: String? = MacUpdater43.prepare(dmg: dmg, target: Bundle.main.bundleURL, pid: ProcessInfo.processInfo.processIdentifier,
                                                bundleId: Bundle.main.bundleIdentifier ?? "no.kristo.kalender.mac", relaunch: false)
        if err == nil { UserDefaults.standard.set(r.version + "|" + String(r.build), forKey: "mac43.updExpect") }
    }

    /// Monterer DMG-en, sjekker appen i den og starter bytte-skriptet (venter til denne prosessen har avsluttet).
    /// nil = klart. Kjøres aldri på hovedtråden (unntatt når appen avslutter).
    nonisolated static func prepare(dmg: URL, target: URL, pid: Int32, bundleId: String, relaunch: Bool = true) -> String? {
        let fm: FileManager = FileManager.default
        let work: URL = cacheDir().appendingPathComponent("mnt-" + UUID().uuidString, isDirectory: true)
        try? fm.createDirectory(at: work, withIntermediateDirectories: true)
        let st: Int32 = run("/usr/bin/hdiutil", ["attach", "-nobrowse", "-readonly", "-noautoopen", "-mountpoint", work.path, dmg.path])
        if st != 0 { return "Kunne ikke åpne DMG-en." }
        var app: URL? = nil
        if let items = try? fm.contentsOfDirectory(at: work, includingPropertiesForKeys: nil) {
            app = items.first { (u: URL) -> Bool in u.pathExtension == "app" && Bundle(url: u)?.bundleIdentifier == bundleId }
        }
        guard let src = app else {
            _ = run("/usr/bin/hdiutil", ["detach", work.path, "-force", "-quiet"])
            return "Fant ikke Kalender i DMG-en."
        }
        let script: URL = cacheDir().appendingPathComponent("bytt43.sh")
        let log: URL = cacheDir().appendingPathComponent("bytt43.log")
        let body: String = """
        #!/bin/sh
        # Kalender for Mac – bytter appen etter at den har avsluttet (prompt 43).
        PID="$1"; SRC="$2"; DST="$3"; MNT="$4"; OPEN="$5"
        i=0
        while kill -0 "$PID" 2>/dev/null; do
          sleep 0.3; i=$((i+1))
          if [ "$i" -gt 400 ]; then /usr/bin/hdiutil detach "$MNT" -force -quiet; exit 1; fi
        done
        NEW="$DST.kal43-ny"; OLD="$DST.kal43-gammel"
        rm -rf "$NEW" "$OLD"
        if /usr/bin/ditto "$SRC" "$NEW"; then
          if mv "$DST" "$OLD"; then
            if mv "$NEW" "$DST"; then rm -rf "$OLD"; else mv "$OLD" "$DST"; fi
          fi
        fi
        rm -rf "$NEW"
        /usr/bin/hdiutil detach "$MNT" -quiet || /usr/bin/hdiutil detach "$MNT" -force -quiet
        if [ "$OPEN" = "1" ]; then /usr/bin/open "$DST"; fi
        exit 0
        """
        do {
            try body.write(to: script, atomically: true, encoding: .utf8)
        } catch {
            _ = run("/usr/bin/hdiutil", ["detach", work.path, "-force", "-quiet"])
            return "Kunne ikke forberede installasjonen."
        }
        // Løsrevet fra appen (nohup, i bakgrunnen), så skriptet lever videre når Kalender avslutter.
        let cmd: String = "nohup /bin/sh \"$0\" \"$1\" \"$2\" \"$3\" \"$4\" \"$5\" >>\"$6\" 2>&1 &"
        let st2: Int32 = run("/bin/sh", ["-c", cmd, script.path, String(pid), src.path, target.path, work.path, relaunch ? "1" : "0", log.path])
        if st2 != 0 {
            _ = run("/usr/bin/hdiutil", ["detach", work.path, "-force", "-quiet"])
            return "Kunne ikke starte installasjonen."
        }
        return nil
    }

    /// Kjører et program og venter (utenfor hovedtråden). Returnerer avslutningskoden (-1 = kunne ikke starte).
    nonisolated static func run(_ path: String, _ args: [String]) -> Int32 {
        let p: Process = Process()
        p.executableURL = URL(fileURLWithPath: path)
        p.arguments = args
        p.standardOutput = FileHandle.nullDevice
        p.standardError = FileHandle.nullDevice
        do {
            try p.run()
        } catch {
            return -1
        }
        p.waitUntilExit()
        return p.terminationStatus
    }

    /* ---------- Tekster ---------- */

    var lastText: String {
        let tail: String = auto ? "ser etter nye versjoner hver dag" : "automatisk sjekk er av"
        if lastCheck <= 0 { return "Ikke sjekket ennå · " + tail }
        let d: Date = Date(timeIntervalSince1970: lastCheck)
        let day: String = KalD.key(d) == KalD.todayKey() ? "i dag" : KalD.dl(d).lowercased()
        return "Sist sjekket " + day + " " + KalD.hm(KalD.minutes(d)) + " · " + tail
    }

    nonisolated static func mb(_ b: Int64) -> String {
        let v: Double = Double(b) / 1_000_000
        return String(format: "%.1f", v).replacingOccurrences(of: ".", with: ",")
    }

    var sizeText: String {
        guard let r = rel else { return "" }
        return r.file + (r.size > 0 ? " · " + MacUpdater43.mb(r.size) + " MB" : "")
    }

    var pct: Double { total > 0 ? Swift.min(1, Double(got) / Double(total)) : 0 }

    var dlSub: String {
        var s: String = MacUpdater43.mb(got) + " av " + (total > 0 ? MacUpdater43.mb(total) : "?") + " MB"
        if speed > 0 { s += " · " + MacUpdater43.mb(Int64(speed)) + " MB/s" }
        return s + " · signatur sjekkes etterpå"
    }
}

/// URLSession-delegaten (bakgrunnskø). Flytter fila med en gang (den midlertidige slettes når metoden returnerer).
final class MacUpdDelegate43: NSObject, URLSessionDownloadDelegate, @unchecked Sendable {
    let dest: URL
    var onProgress: ((Int64, Int64) -> Void)? = nil
    var onDone: ((URL?, String?) -> Void)? = nil
    private var moved: Bool = false
    private var moveError: String? = nil

    init(dest: URL) {
        self.dest = dest
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64,
                    totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        onProgress?(totalBytesWritten, totalBytesExpectedToWrite)
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        let code: Int = (downloadTask.response as? HTTPURLResponse)?.statusCode ?? 200
        if code >= 400 {
            moveError = "Serveren svarte med feil " + String(code) + "."
            return
        }
        let fm: FileManager = FileManager.default
        do {
            try fm.createDirectory(at: dest.deletingLastPathComponent(), withIntermediateDirectories: true)
            try? fm.removeItem(at: dest)
            try fm.moveItem(at: location, to: dest)
            moved = true
        } catch {
            moveError = "Kunne ikke lagre nedlastingen."
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error {
            let ns: NSError = error as NSError
            onDone?(nil, ns.code == NSURLErrorCancelled ? "Nedlastingen ble avbrutt." : "Nedlastingen stoppet: " + error.localizedDescription)
            return
        }
        onDone?(moved ? dest : nil, moveError)
    }
}

/* ---------- Vinduet: Innstillinger → Oppdateringer ---------- */

struct MacUpdate43View: View {
    @Environment(\.mk) private var t
    @ObservedObject var u: MacUpdater43 = MacUpdater43.shared

    private let green: Color = Color(kalHex: "#2f6b4a")

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            head
            stateCard
            prefs
        }
    }

    private var head: some View {
        HStack(spacing: 14) {
            MacAppIcon(size: 56)
            VStack(alignment: .leading, spacing: 2) {
                Text("Programvareoppdatering").font(MacFont.serif(24)).foregroundColor(t.ink)
                Text(u.phase == .done ? "Kalender " + MacUpdater43.currentVersion + " · macOS" : u.currentLabel)
                    .font(MacFont.ui(13.5)).foregroundColor(t.mut)
            }
        }
    }

    private func card<C: View>(border: Color? = nil, @ViewBuilder _ c: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 10) { c() }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 18).fill(t.card))
            .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(border ?? t.line, lineWidth: border == nil ? 1 : 1.5))
    }

    private func dark(_ title: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(MacFont.ui(14, .heavy)).foregroundColor(t.bg)
                .padding(.horizontal, 20).frame(height: 44)
                .background(Capsule().fill(t.ink))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private func light(_ title: String, height: CGFloat = 44, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(MacFont.ui(14, .bold)).foregroundColor(t.ink)
                .padding(.horizontal, 18).frame(height: height)
                .overlay(Capsule().strokeBorder(t.line, lineWidth: 1))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder private var stateCard: some View {
        switch u.phase {
        case .idle:
            card {
                Text(u.lastText).font(MacFont.ui(14)).foregroundColor(t.mut)
                dark("Se etter oppdateringer") { Task { await u.check() } }
            }
        case .check:
            card { Text("Ser etter oppdateringer på " + MacStore.shared.host43 + " …").font(MacFont.ui(14, .bold)).foregroundColor(t.ink) }
        case .none:
            card {
                Text("Kalender er oppdatert").font(MacFont.ui(15, .bold)).foregroundColor(t.ink)
                Text(u.currentLabel + " er nyeste versjon.").font(MacFont.ui(14)).foregroundColor(t.mut)
                light("Se etter på nytt", height: 36) { Task { await u.check() } }
            }
        case .avail:
            card(border: t.ink) {
                HStack(alignment: .firstTextBaseline) {
                    Text(u.rel?.label ?? "Ny versjon").font(MacFont.serif(22)).foregroundColor(t.ink)
                    Spacer()
                    Text(u.sizeText).font(MacFont.mono(12)).foregroundColor(t.mut)
                }
                if !(u.rel?.notes.isEmpty ?? true) {
                    Text("NYTT").font(MacFont.mono(10.5)).tracking(1.3).foregroundColor(t.red)
                    ForEach(Array((u.rel?.notes ?? []).enumerated()), id: \.offset) { (pair: (offset: Int, element: String)) in
                        HStack(alignment: .top, spacing: 10) {
                            Text("•").foregroundColor(t.red)
                            Text(pair.element).fixedSize(horizontal: false, vertical: true)
                        }
                        .font(MacFont.ui(14)).foregroundColor(t.ink)
                    }
                }
                HStack(spacing: 8) {
                    dark("Last ned og installer") { u.download() }
                    light("Senere") { u.later() }
                }
            }
        case .dl:
            card {
                HStack {
                    Text("Laster ned " + (u.rel?.version ?? "")).font(MacFont.ui(14, .bold)).foregroundColor(t.ink)
                    Spacer()
                    Text(String(Int(u.pct * 100)) + " %").font(MacFont.mono(13)).foregroundColor(t.ink)
                }
                GeometryReader { (g: GeometryProxy) in
                    ZStack(alignment: .leading) {
                        Capsule().fill(t.line2)
                        Capsule().fill(t.ink).frame(width: g.size.width * CGFloat(u.pct))
                    }
                }
                .frame(height: 8)
                Text(u.message.isEmpty ? u.dlSub : u.message).font(MacFont.ui(13)).foregroundColor(t.mut)
                light("Avbryt", height: 40) { u.cancelDownload() }
            }
        case .ready:
            card {
                Text("Klar til å installere").font(MacFont.ui(15, .bold)).foregroundColor(t.ink)
                Text("Signaturen er sjekket. Kalender lukkes, oppdateres og åpnes igjen der du var. Tar noen sekunder.")
                    .font(MacFont.ui(14)).foregroundColor(t.mut).fixedSize(horizontal: false, vertical: true)
                Text("Kalender er ad hoc-signert: macOS kan spørre om du vil åpne den nye versjonen første gang. Velg Åpne (eller høyreklikk på Kalender → Åpne).")
                    .font(MacFont.ui(12)).foregroundColor(t.mut2).fixedSize(horizontal: false, vertical: true)
                dark("Installer og start på nytt") { u.install() }
            }
        case .inst:
            card { Text("Installerer … Kalender starter på nytt").font(MacFont.ui(14, .bold)).foregroundColor(t.ink) }
        case .done:
            VStack(alignment: .leading, spacing: 6) {
                Text("✓ Kalender er oppdatert til " + MacUpdater43.currentVersion + (MacUpdater43.currentBuild > 0 ? " (" + String(MacUpdater43.currentBuild) + ")" : ""))
                    .font(MacFont.ui(15, .bold)).foregroundColor(green)
                Text("Kalenderne, innstillingene og innloggingen er beholdt.").font(MacFont.ui(14)).foregroundColor(t.mut)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 18).fill(green.opacity(0.10)))
            .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(green.opacity(0.35), lineWidth: 1))
        case .err:
            card {
                Text(u.message.isEmpty ? "Noe gikk galt." : u.message).font(MacFont.ui(14, .bold)).foregroundColor(t.acc)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 8) {
                    dark("Prøv igjen") { Task { await u.check() } }
                    if u.noServer { light("Åpne siste release") { u.openReleasePage() } }
                }
            }
        }
    }

    private var prefs: some View {
        VStack(spacing: 0) {
            MacToggleRow43(title: "Se etter oppdateringer automatisk", sub: "Én gang om dagen fra " + MacStore.shared.host43, on: $u.auto)
            MacToggleRow43(title: "Last ned og installer i bakgrunnen", sub: "Installeres neste gang Kalender lukkes", on: $u.autoDl)
            HStack {
                Text("Kanal").font(MacFont.ui(15, .bold)).foregroundColor(t.ink)
                Spacer()
                Picker("", selection: $u.channel) {
                    Text("Stabil").tag("stabil")
                    Text("Beta").tag("beta")
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .frame(width: 160)
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 56)
            .overlay(alignment: .top) { Rectangle().fill(t.line2).frame(height: 1) }
        }
        .background(RoundedRectangle(cornerRadius: 18).fill(t.card))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(t.line, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 18))
    }
}

/// Rad med tittel, undertekst og bryter (Innstillinger-vinduet).
struct MacToggleRow43: View {
    @Environment(\.mk) private var t
    let title: String
    let sub: String
    @Binding var on: Bool

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(MacFont.ui(15, .bold)).foregroundColor(t.ink)
                if !sub.isEmpty { Text(sub).font(MacFont.ui(12.5)).foregroundColor(t.mut) }
            }
            Spacer()
            Toggle("", isOn: $on).toggleStyle(.switch).labelsHidden()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 6)
        .frame(minHeight: 56)
        .overlay(alignment: .top) { Rectangle().fill(t.line2).frame(height: 1) }
        .contentShape(Rectangle())
    }
}

/* ---------- Om Kalender (eget lite vindu) ---------- */

struct MacAbout43View: View {
    @Environment(\.mk) private var t

    private var versionText: String {
        let build: Int = MacUpdater43.currentBuild
        let suffix: String = build > 0 ? " (" + String(build) + ")" : ""
        return "Versjon " + MacUpdater43.currentVersion + suffix
    }

    var body: some View {
        VStack(spacing: 8) {
            MacAppIcon(size: 84)
            Text("Kalender").font(MacFont.serif(26)).foregroundColor(t.ink)
            Text(versionText)
                .font(MacFont.mono(12)).foregroundColor(t.mut)
            Text("Data ligger på hjemmeserveren din").font(MacFont.ui(12.5)).foregroundColor(t.mut)
        }
        .padding(.horizontal, 48)
        .padding(.vertical, 28)
        .frame(width: 320)
        .background(t.bg)
    }
}

/// Fanen Innstillinger-vinduet åpner på (Kalender → Se etter oppdateringer … → Oppdateringer).
@MainActor
final class MacPrefsTab43: ObservableObject {
    static let shared: MacPrefsTab43 = MacPrefsTab43()
    /// gen | acc | upd
    @Published var tab: String = "gen"
}
