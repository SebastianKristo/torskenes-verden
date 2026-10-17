import Foundation
import SwiftUI
import UIKit
import LocalAuthentication
import Network

/// Fanene i Finans. Matplan og de andre modulene ligger i menyen bak profilbildet («Andre OS»).
enum Tab: String, CaseIterable, Identifiable {
    case home = "Hjem", list = "Liste", budget = "Budsjett"
    var id: String { rawValue }
    var icon: String {
        switch self {
        case .home: "house"
        case .list: "list.bullet"
        case .budget: "chart.pie"
        }
    }
}

/// Skjermer som fyller hele vinduet: opplastingskøen, modulene og innstillinger.
enum Module: String, CaseIterable, Identifiable {
    case upload = "Last opp", mat = "Matplan", domains = "Domener", sub = "Subscription OS", folders = "Delte mapper", finn = "Finn-handler", settings = "Innstillinger"
    var id: String { rawValue }
    var icon: String {
        switch self {
        case .upload: "square.and.arrow.up"
        case .mat: "fork.knife"
        case .domains: "globe"
        case .sub: "arrow.triangle.2.circlepath"
        case .folders: "folder.badge.person.crop"
        case .finn: "bag"
        case .settings: "gearshape"
        }
    }
    static let others: [Module] = [.mat, .domains, .sub, .folders, .finn]
}

enum DomTab: String, CaseIterable, Identifiable {
    case traffic = "Trafikk", visits = "Besøk", perf = "Ytelse", security = "Sikkerhet"
    var id: String { rawValue }
    var icon: String {
        switch self {
        case .traffic: "chart.xyaxis.line"
        case .visits: "globe.europe.africa"
        case .perf: "speedometer"
        case .security: "shield.lefthalf.filled"
        }
    }
}

/// En innlogget konto. Flere kan være logget inn samtidig; hver har egne data, tokens og varsler.
struct Account: Codable, Identifiable, Hashable {
    var id: String
    var server: String
    var username: String
    var name: String
    var role: String
    var token: String
    var local: String
    var external: String
    var label: String { name.isEmpty ? (username.isEmpty ? "Konto" : username) : name }
}

struct PendingLogin { let server: String; let username: String; let password: String }

@MainActor
@Observable
final class Store {
    /* ---------- Kontoer (nøkkelringen) ---------- */

    private(set) var accounts: [Account] = Store.loadAccounts()
    private(set) var activeId: String? = Keychain.get("active")
    var account: Account? { accounts.first { $0.id == activeId } ?? accounts.first }
    var loggedIn: Bool { account != nil }
    var server: String { account?.server ?? Keychain.get("server") ?? "" }
    var displayName: String {
        if let n = me?.name, !n.isEmpty { return n }
        if let a = account, !a.name.isEmpty { return a.name }
        return boot?.settings.name ?? ""
    }
    private(set) var base = ""
    private(set) var route = "–"
    private(set) var lastSync: Date?
    var addingAccount = false
    private(set) var pending: PendingLogin?

    /* ---------- Tilstand ---------- */

    var tab: Tab = .home
    var module: Module?
    var boot: Boot?
    var summary: Summary?
    var me: Me?
    var txs: [Tx]?
    var receipts: [Receipt]?
    var query = ""
    var filter = ""
    var selectedTx: Int?
    var selectedBudget: Int?
    var selectedReceipt: String?
    var busy = false
    var message: String?
    var jobs: [Job] = []
    var uploading = 0
    var menuOpen = false
    var settingsPage: String?

    var week: Week?
    var subs: SubList?
    var folders: [Folder]?
    var folder: Folder?
    var finn: FinnList?
    var tokens: [TokenInfo]?
    var tokenError: String?
    var newToken: String?
    var domains: [DomainRef]?
    var domain: String?
    var analytics: Analytics?
    var domTab: DomTab = .traffic
    var domRange = "24h"
    var moduleError: String?

    /* ---------- Valg (UserDefaults) ---------- */

    /// Fargeflekker bak glasset.
    var colorBg = UserDefaults.standard.object(forKey: "fh_ios_bg") as? Bool ?? true { didSet { UserDefaults.standard.set(colorBg, forKey: "fh_ios_bg") } }
    var lockEnabled = UserDefaults.standard.bool(forKey: "fh_lock") { didSet { UserDefaults.standard.set(lockEnabled, forKey: "fh_lock") } }
    var lockAfter = UserDefaults.standard.integer(forKey: "fh_lock_after") { didSet { UserDefaults.standard.set(lockAfter, forKey: "fh_lock_after") } }
    var hideSwitcher = UserDefaults.standard.bool(forKey: "fh_hide_switcher") { didSet { UserDefaults.standard.set(hideSwitcher, forKey: "fh_hide_switcher") } }
    var hideAmounts = UserDefaults.standard.bool(forKey: "fh_hide_amounts") { didSet { UserDefaults.standard.set(hideAmounts, forKey: "fh_hide_amounts"); Privacy.shared.hidden = hideAmounts } }
    var startPage = UserDefaults.standard.string(forKey: "fh_start") ?? "home" { didSet { UserDefaults.standard.set(startPage, forKey: "fh_start") } }
    /// «camera»: trykk åpner kameraet, hold inne viser valg. «choices»: omvendt.
    var scanTap = UserDefaults.standard.string(forKey: "fh_scan_tap") ?? "camera" { didSet { UserDefaults.standard.set(scanTap, forKey: "fh_scan_tap") } }
    var autoCrop = UserDefaults.standard.object(forKey: "fh_auto_crop") as? Bool ?? true { didSet { UserDefaults.standard.set(autoCrop, forKey: "fh_auto_crop") } }
    var keepOriginal = UserDefaults.standard.object(forKey: "fh_keep_original") as? Bool ?? true { didSet { UserDefaults.standard.set(keepOriginal, forKey: "fh_keep_original") } }
    var wifiOnly = UserDefaults.standard.bool(forKey: "fh_wifi_only") { didSet { UserDefaults.standard.set(wifiOnly, forKey: "fh_wifi_only") } }
    var useLocal = UserDefaults.standard.object(forKey: "fh_use_local") as? Bool ?? true { didSet { UserDefaults.standard.set(useLocal, forKey: "fh_use_local") } }
    var nSub = UserDefaults.standard.object(forKey: "fh_n_sub") as? Bool ?? true { didSet { UserDefaults.standard.set(nSub, forKey: "fh_n_sub") } }
    var nDomain = UserDefaults.standard.object(forKey: "fh_n_domain") as? Bool ?? true { didSet { UserDefaults.standard.set(nDomain, forKey: "fh_n_domain") } }
    var nWeekly = UserDefaults.standard.bool(forKey: "fh_n_weekly") { didSet { UserDefaults.standard.set(nWeekly, forKey: "fh_n_weekly") } }

    /* ---------- Lås ---------- */

    var locked = false
    @ObservationIgnored private var backgroundAt: Date?

    @ObservationIgnored private var logos: [String: UIImage] = [:]
    @ObservationIgnored private var polling = false
    @ObservationIgnored private let monitor = NWPathMonitor()
    private(set) var onWifi = true
    /// Skann uten nett (eller utenfor Wi-Fi) venter her og lastes opp ved neste synk.
    private(set) var offline: [Upload] = []

    private var api: API { API(base: base.isEmpty ? (account?.server ?? "") : base, token: account?.token) }

    init() {
        base = account?.server ?? ""
        tab = Store.start(startPage)
        locked = loggedIn && lockEnabled
        Privacy.shared.hidden = hideAmounts
        monitor.pathUpdateHandler = { [weak self] path in
            let wifi = path.usesInterfaceType(.wifi) || path.usesInterfaceType(.wiredEthernet)
            Task { @MainActor in self?.onWifi = wifi }
        }
        monitor.start(queue: DispatchQueue(label: "finanshub.net"))
    }

    private static func start(_ s: String) -> Tab { s == "list" ? .list : s == "budget" ? .budget : .home }

    nonisolated private static func loadAccounts() -> [Account] {
        if let raw = Keychain.get("accounts"), let d = raw.data(using: .utf8), let list = try? JSONDecoder().decode([Account].self, from: d) { return list }
        // Eldre versjon: én server og ett token.
        guard let server = Keychain.get("server"), let token = Keychain.get("token") else { return [] }
        let a = Account(id: UUID().uuidString, server: server, username: "", name: "", role: "admin", token: token, local: "", external: "")
        if let d = try? JSONEncoder().encode([a]) { Keychain.set("accounts", String(data: d, encoding: .utf8)); Keychain.set("active", a.id) }
        Keychain.set("token", nil)
        return [a]
    }

    private func saveAccounts() {
        if let d = try? JSONEncoder().encode(accounts) { Keychain.set("accounts", String(data: d, encoding: .utf8)) }
        Keychain.set("active", activeId)
    }

    private func run(_ work: @escaping () async throws -> Void) {
        Task {
            do { try await work() } catch let e as APIError where e.status == 401 && loggedIn && !e.needsTotp {
                expired()
            } catch { message = error.localizedDescription }
        }
    }

    func flash(_ text: String) {
        message = text
        Task { try? await Task.sleep(for: .seconds(2)); if message == text { message = nil } }
    }

    /* ---------- Lås ---------- */

    func didEnterBackground() { backgroundAt = Date() }
    /// Bare etter at appen har vært i bakgrunnen (Face ID-dialogen gjør den bare inaktiv, så avbryt gir ingen løkke).
    func didBecomeActive() {
        guard let at = backgroundAt else { return }
        backgroundAt = nil
        if hideAmounts { Privacy.shared.hidden = true }
        if loggedIn, lockEnabled, Date().timeIntervalSince(at) >= Double(lockAfter * 60) { locked = true; unlock() }
    }

    /// Face ID / Touch ID med kode som reserve.
    func unlock() {
        let ctx = LAContext()
        var err: NSError?
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &err) else { locked = false; return }
        ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Lås opp FinansHub") { ok, _ in
            Task { @MainActor in if ok { self.locked = false } }
        }
    }

    /* ---------- Innlogging og kontoer ---------- */

    func login(server raw: String, username: String, password: String, code: String? = nil) {
        run {
            self.busy = true
            defer { self.busy = false }
            let srv = API.normalize(raw)
            guard !srv.isEmpty else { self.message = "Skriv inn serveradressen"; return }
            let r: LoginResult
            do {
                r = try await API.login(base: srv, username: username, password: password, code: code, device: UIDevice.current.name)
            } catch let e as APIError where e.needsTotp {
                if self.pending != nil, let code, !code.isEmpty { self.message = e.message }
                self.pending = PendingLogin(server: srv, username: username, password: password)
                return
            }
            self.pending = nil
            Keychain.set("server", srv)
            let same = self.accounts.first { $0.server == srv && $0.username.lowercased() == r.username.lowercased() }
            let acc = Account(id: same?.id ?? UUID().uuidString, server: srv, username: r.username, name: r.name, role: r.role, token: r.token, local: same?.local ?? "", external: same?.external ?? "")
            self.accounts = self.accounts.filter { $0.id != acc.id } + [acc]
            self.addingAccount = false
            self.switchTo(acc.id)
            self.flash("Logget inn som \(r.name)")
        }
    }

    func cancelTotp() { pending = nil }

    func switchTo(_ id: String) {
        activeId = id
        saveAccounts()
        clearData()
        base = account?.server ?? ""
        menuOpen = false
        module = nil
        tab = Store.start(startPage)
        refresh()
    }

    func logout(_ id: String? = nil) {
        guard let a = accounts.first(where: { $0.id == (id ?? activeId) }) else { return }
        run {
            _ = try? await API(base: a.server, token: a.token).call("POST", "/auth/logout")
            self.remove(a.id)
        }
    }

    func logoutOthers() {
        let others = accounts.filter { $0.id != activeId }
        run {
            for a in others { _ = try? await API(base: a.server, token: a.token).call("POST", "/auth/logout") }
            self.accounts = self.accounts.filter { $0.id == self.activeId }
            self.saveAccounts()
            self.flash("Andre kontoer er logget ut")
        }
    }

    private func remove(_ id: String) {
        accounts.removeAll { $0.id == id }
        if activeId == id {
            activeId = accounts.first?.id
            clearData()
            base = account?.server ?? ""
            if loggedIn { refresh() }
        }
        saveAccounts()
    }

    private func expired() {
        let name = account?.label ?? ""
        if let a = account { remove(a.id) }
        message = "Innloggingen for \(name) er utløpt. Logg inn igjen."
    }

    private func clearData() {
        boot = nil; summary = nil; me = nil; txs = nil; receipts = nil; jobs = []; selectedTx = nil; selectedReceipt = nil
        week = nil; subs = nil; folders = nil; folder = nil; finn = nil; tokens = nil; domains = nil; analytics = nil; domain = nil
        logos = [:]
    }

    func updateAddresses(local: String, external: String) {
        guard var a = account else { return }
        a.local = local.trimmingCharacters(in: .whitespaces).isEmpty ? "" : API.normalize(local)
        a.external = external.trimmingCharacters(in: .whitespaces).isEmpty ? "" : API.normalize(external)
        accounts = accounts.map { $0.id == a.id ? a : $0 }
        saveAccounts()
        refresh()
    }

    /// Lokal adresse når den svarer (og «Bruk lokal adresse hjemme» er på), ellers ekstern.
    private func resolveBase() async {
        guard let a = account else { return }
        if useLocal, !a.local.isEmpty, await API(base: a.local, token: a.token).reachable() { base = a.local; route = "Lokal"; return }
        base = a.external.isEmpty ? a.server : a.external
        let host = URL(string: base)?.host ?? ""
        route = API.isLocal(host) ? "Lokal" : "Ekstern"
    }

    func testConnection(_ raw: String) {
        run {
            let u = API.normalize(raw.isEmpty ? self.base : raw)
            let t0 = Date()
            let ok = await API(base: u, token: self.account?.token).reachable(timeout: 5)
            let ms = Int(Date().timeIntervalSince(t0) * 1000)
            self.flash(ok ? "Svar fra \(u.replacingOccurrences(of: "http://", with: "").replacingOccurrences(of: "https://", with: "")) på \(ms) ms" : "Fikk ikke kontakt med \(u)")
        }
    }

    /* ---------- Data ---------- */

    func reload() async throws {
        await resolveBase()
        boot = try await api.get("/bootstrap")
        summary = try await api.get("/summary")
        me = try? await api.get("/me", as: Me.self)
        if let m = me, let a = account, let u = m.username, !u.isEmpty, a.username != u || a.name != (m.name ?? a.name) {
            var n = a; n.username = u; n.name = m.name ?? a.name; n.role = m.role ?? a.role
            accounts = accounts.map { $0.id == n.id ? n : $0 }
            saveAccounts()
        }
        lastSync = Date()
        if !offline.isEmpty, canUpload { let q = offline; offline = []; upload(q) }
        if let m = module { try await load(m) } else if tab != .home { try await loadTx() }
    }

    func refresh() { run { try await self.reload() } }

    private func load(_ m: Module) async throws {
        moduleError = nil
        do {
            switch m {
            case .upload: try await loadReceipts(); await loadJobs()
            case .mat: try await loadWeek()
            case .sub: subs = try await api.get("/subscriptions")
            case .folders: let list: [Folder] = try await decodeList(api.call("GET", "/folders")); folders = list
            case .finn: finn = try await api.get("/finn")
            case .domains: try await loadDomains()
            case .settings: break
            }
        } catch let e as APIError where e.status == 401 || e.status == 403 || e.status == 404 {
            moduleError = e.status == 404 ? "\(m.rawValue) finnes ikke på serveren ennå. Oppdater homelab." : "\(m.rawValue) er ikke tilgjengelig for denne kontoen (\(e.message))."
        } catch is DecodingError {
            moduleError = "Uventet svar fra serveren for \(m.rawValue)."
        }
    }

    /// Lister kan komme som [..] eller {items: [..]}.
    private func decodeList<T: Decodable>(_ d: Data) throws -> [T] {
        if let list = try? JSONDecoder().decode([T].self, from: d) { return list }
        return try JSONDecoder().decode(ItemsWrap<T>.self, from: d).items
    }

    func go(_ t: Tab) {
        if t != tab { selectedTx = nil }
        tab = t
        module = nil
        menuOpen = false
        run {
            if t == .home { self.summary = try await self.api.get("/summary") }
            else if self.txs == nil { try await self.loadTx() }
        }
    }

    func open(_ m: Module?) {
        menuOpen = false
        module = m
        if m != .folders { folder = nil }
        guard let m else { return }
        if m == .settings { settingsPage = nil }
        run { try await self.load(m) }
    }

    func loadTx() async throws {
        var q: [String] = []
        if !query.isEmpty, let e = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) { q.append("q=\(e)") }
        if !filter.isEmpty { q.append("type=\(filter)") }
        txs = (try await api.get("/transactions?" + q.joined(separator: "&"), as: TxPage.self)).items
    }
    func search() { run { try await self.loadTx() } }

    func loadReceipts() async throws {
        let list: [Receipt] = try await api.get("/receipts?status=queue")
        receipts = list
        if selectedReceipt == nil || !list.contains(where: { $0.id == selectedReceipt }) {
            if UIDevice.current.userInterfaceIdiom == .pad { selectedReceipt = list.first(where: { $0.status == "needs_review" })?.id }
            else if selectedReceipt != nil { selectedReceipt = nil }
        }
        // Følg med mens AI-en leser.
        if list.contains(where: { $0.status == "pending" || $0.status == "processing" }) {
            Task { try? await Task.sleep(for: .seconds(2)); try? await self.loadReceipts() }
        }
    }

    func update(_ id: String, _ field: String, _ value: Any?) {
        run {
            let d = try await self.api.call("PATCH", "/receipts/\(id)", json: [field: value ?? NSNull()])
            let r = try JSONDecoder().decode(Receipt.self, from: d)
            self.receipts = self.receipts?.map { $0.id == id ? r : $0 }
        }
    }

    func book(_ id: String) { receiptAction(id, "book", "Bokført ✓") }
    func reject(_ id: String) { receiptAction(id, "reject", "Kvittering avvist") }
    private func receiptAction(_ id: String, _ action: String, _ done: String) {
        run {
            try await self.api.call("POST", "/receipts/\(id)/\(action)")
            self.selectedReceipt = self.receipts?.first(where: { $0.id != id && $0.status == "needs_review" })?.id
            try await self.loadReceipts()
            self.boot = try await self.api.get("/bootstrap")
            self.summary = try await self.api.get("/summary")
            self.flash(done)
        }
    }

    func setCategory(tx: Int, category: Int) {
        run {
            try await self.api.call("PATCH", "/transactions/\(tx)", json: ["categoryId": category])
            try await self.loadTx()
            self.summary = try await self.api.get("/summary")
            self.flash("Kategori endret")
        }
    }

    func save(_ key: String, _ value: Any) {
        run {
            try await self.api.call("PUT", "/settings", json: [key: value])
            self.boot = try await self.api.get("/bootstrap")
        }
    }

    /* ---------- Opplasting ---------- */

    enum Upload { case image(UIImage), pdf(Data) }
    private var canUpload: Bool { !wifiOnly || onWifi }

    /// Flere filer legges i kø og lastes opp én og én; AI-en leser dem i bakgrunnen på serveren.
    func upload(_ files: [Upload]) {
        guard !files.isEmpty else { return }
        module = .upload
        guard canUpload else { offline += files; flash("\(files.count) kvittering(er) venter på Wi-Fi"); return }
        uploading += files.count
        Task {
            for f in files {
                do {
                    switch f {
                    case .image(let img): try await self.sendImage(img)
                    case .pdf(let d): try await self.finishUpload([API.Part(name: "file", filename: "kvittering.pdf", mime: "application/pdf", data: d)])
                    }
                } catch let e as APIError where e.status == 0 {
                    self.offline.append(f) // uten nett: prøv igjen ved neste synk
                    self.message = e.message
                } catch { self.message = error.localizedDescription }
                self.uploading = max(0, self.uploading - 1)
            }
            try? await self.loadReceipts()
            await self.loadJobs()
        }
    }
    func upload(image: UIImage) { upload([.image(image)]) }
    func upload(pdf: Data) { upload([.pdf(pdf)]) }

    func loadJobs() async {
        if let j = try? await api.get("/receipts/jobs", as: [Job].self) { jobs = j }
        let active = jobs.contains { $0.status == "pending" || $0.status == "processing" }
        if (active || uploading > 0) && !polling {
            polling = true
            Task {
                try? await Task.sleep(for: .seconds(2))
                self.polling = false
                await self.loadJobs()
                if !self.jobs.contains(where: { $0.status == "pending" || $0.status == "processing" }) {
                    try? await self.loadReceipts()
                    self.summary = try? await self.api.get("/summary", as: Summary.self)
                }
            }
        }
    }

    func logo(_ domain: String?) async -> UIImage? {
        guard let domain, !domain.isEmpty else { return nil }
        if let l = logos[domain] { return l }
        let enc = domain.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? domain
        let img = await image("/finans/api/logo/\(enc)")
        if let img { logos[domain] = img }
        return img
    }

    /// Originalen lastes opp (med mindre «Lagre originalbildet» er av), sammen med en 1600 px JPEG til AI-en og et miniatyrbilde.
    private func sendImage(_ image: UIImage) async throws {
        let scan = image.scaled(max: 1600).jpegData(compressionQuality: 0.85)
        guard let file = keepOriginal ? image.jpegData(compressionQuality: 0.92) : (scan ?? image.jpegData(compressionQuality: 0.92)) else { return }
        var parts = [API.Part(name: "file", filename: "kvittering.jpg", mime: "image/jpeg", data: file)]
        if let scan { parts.append(.init(name: "scan", filename: "scan.jpg", mime: "image/jpeg", data: scan)) }
        if let t = image.scaled(max: 240).jpegData(compressionQuality: 0.75) { parts.append(.init(name: "thumb", filename: "thumb.jpg", mime: "image/jpeg", data: t)) }
        try await finishUpload(parts)
    }

    private func finishUpload(_ parts: [API.Part]) async throws {
        let d = try await api.upload("/receipts", parts: parts)
        if selectedReceipt == nil, let r = try? JSONDecoder().decode(Receipt.self, from: d), UIDevice.current.userInterfaceIdiom == .pad { selectedReceipt = r.id }
        await loadJobs()
    }

    func image(_ path: String) async -> UIImage? {
        guard let d = try? await api.bytes(path) else { return nil }
        return UIImage(data: d)
    }

    /* ---------- Matplan ---------- */

    func loadWeek() async throws { week = try await api.mat("/week", as: Week.self) }
    func planWeek() {
        run {
            self.busy = true
            defer { self.busy = false }
            try await self.api.matCall("POST", "/plan", json: ["scope": "week"])
            try await self.loadWeek()
            self.flash("Ny ukeplan klar ✦")
        }
    }
    func planDay(_ date: String) { run { try await self.api.matCall("POST", "/plan", json: ["scope": "day", "date": date]); try await self.loadWeek() } }
    func setCook(_ date: String, _ cook: String) { run { try await self.api.matCall("PATCH", "/day/\(date)", json: ["cook": cook]); try await self.loadWeek() } }
    func toggleFixed(_ d: MealDay) { run { try await self.api.matCall("PATCH", "/day/\(d.date)", json: ["fixed": !(d.fixed ?? false)]); try await self.loadWeek() } }
    func toggleShop(_ id: String) { run { try await self.api.matCall("POST", "/shopping/\(id)/toggle"); try await self.loadWeek() } }

    /* ---------- Subscription OS ---------- */

    func addSub(name: String, plan: String, price: String, cycle: String, next: String) {
        run {
            let p = price.replacingOccurrences(of: " ", with: "").replacingOccurrences(of: ",", with: ".")
            try await self.api.call("POST", "/subscriptions", json: ["name": name, "plan": plan, "price": p, "cycle": cycle, "nextDate": next])
            self.subs = try await self.api.get("/subscriptions")
            self.flash("\(name) lagt til")
        }
    }
    func setSubActive(_ s: Sub, _ active: Bool) {
        run {
            try await self.api.call("PATCH", "/subscriptions/\(s.id)", json: ["active": active])
            self.subs = try await self.api.get("/subscriptions")
        }
    }

    /* ---------- Delte mapper ---------- */

    func openFolder(_ id: Int?) {
        guard let id else { folder = nil; return }
        run { self.folder = try await self.api.get("/folders/\(id)") }
    }
    func addFolderEntry(_ desc: String, _ amount: String, paidBy: String?) {
        guard let f = folder else { return }
        run {
            var body: [String: Any] = ["description": desc, "amount": amount.replacingOccurrences(of: " ", with: "").replacingOccurrences(of: ",", with: ".")]
            if let paidBy { body["paidBy"] = paidBy }
            let d = try await self.api.call("POST", "/folders/\(f.id)/entries", json: body)
            self.folder = try JSONDecoder().decode(Folder.self, from: d)
            let list: [Folder] = try await self.decodeList(self.api.call("GET", "/folders")); self.folders = list
            self.flash("Lagt til i \(f.name)")
        }
    }

    /* ---------- Domener ---------- */

    private func loadDomains() async throws {
        let list: [DomainRef] = try await decodeList(api.raw("/domains/api", "/domains"))
        domains = list
        if domain == nil || !list.contains(where: { $0.name == domain }) { domain = list.first?.name }
        try await loadAnalytics()
    }

    private func loadAnalytics() async throws {
        guard let d = domain else { analytics = nil; return }
        let enc = d.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? d
        analytics = try await api.module("/domains/api", "/\(enc)/analytics?range=\(domRange)", as: Analytics.self)
    }

    func pickDomain(_ name: String) { domain = name; analytics = nil; run { try await self.loadAnalytics() } }
    func setRange(_ r: String) { domRange = r; run { try await self.loadAnalytics() } }
    func reloadDomain() { run { try await self.loadDomains(); self.flash("Oppdatert fra Cloudflare") } }

    /* ---------- API-tokens ---------- */

    func loadTokens() {
        tokenError = nil
        run {
            do { let list: [TokenInfo] = try await self.decodeList(self.api.call("GET", "/tokens")); self.tokens = list } catch let e as APIError {
                self.tokens = []
                self.tokenError = (e.status == 401 || e.status == 403) ? "Tokens kan bare administreres fra FinansHub i nettleseren for denne kontoen." : e.message
            }
        }
    }

    func createToken(name: String, scopes: [String], days: Int?) {
        run {
            var body: [String: Any] = ["name": name, "scopes": scopes]
            if let days { body["expiresDays"] = days; body["expires"] = days }
            let d = try await self.api.call("POST", "/tokens", json: body)
            self.newToken = (try JSONSerialization.jsonObject(with: d) as? [String: Any])?["token"] as? String
            self.loadTokens()
        }
    }

    func revokeToken(_ id: String) { run { try await self.api.call("DELETE", "/tokens/\(id)"); self.flash("Token trukket tilbake"); self.loadTokens() } }

    /* ---------- Data og lagring ---------- */

    func clearCache() { logos = [:]; URLCache.shared.removeAllCachedResponses(); flash("Hurtigbuffer tømt") }

    /// Alle transaksjoner som CSV (semikolon, UTF-8 med BOM) i en midlertidig fil for delingsarket.
    func exportCsv() async -> URL? {
        busy = true
        defer { busy = false }
        do {
            let all = try await api.get("/transactions?limit=100000", as: TxPage.self).items
            func esc(_ s: String) -> String { s.contains(";") || s.contains("\"") || s.contains("\n") ? "\"" + s.replacingOccurrences(of: "\"", with: "\"\"") + "\"" : s }
            var csv = "\u{FEFF}Dato;Beskrivelse;Beløp;Kategori;Konto;Notat\r\n"
            for t in all { csv += [t.date, esc(t.description), String(t.amount).replacingOccurrences(of: ".", with: ","), esc(t.category), esc(t.account), esc(t.note)].joined(separator: ";") + "\r\n" }
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("finanshub-transaksjoner.csv")
            try csv.write(to: url, atomically: true, encoding: .utf8)
            return url
        } catch { message = error.localizedDescription; return nil }
    }
}

/// Liste pakket som {items: [..]}.
struct ItemsWrap<T: Decodable>: Decodable { let items: [T] }

extension UIImage {
    /// Tegner bildet på nytt, noe som også retter orienteringen fra kameraet.
    func scaled(max: CGFloat) -> UIImage {
        let s = min(1, max / Swift.max(size.width, size.height))
        let target = CGSize(width: (size.width * s).rounded(), height: (size.height * s).rounded())
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: target, format: format).image { _ in draw(in: CGRect(origin: .zero, size: target)) }
    }
}
