import Foundation
import SwiftUI
import UIKit

enum Tab: String, CaseIterable, Identifiable {
    case home = "Hjem", list = "Liste", budget = "Budsjett", mat = "Matplan", scan = "Last opp", me = "Meg"
    var id: String { rawValue }
    var icon: String {
        switch self {
        case .home: "house"
        case .list: "list.bullet"
        case .budget: "chart.pie"
        case .mat: "fork.knife"
        case .scan: "square.and.arrow.up"
        case .me: "person"
        }
    }
}

@MainActor
@Observable
final class Store {
    var server = Keychain.get("server") ?? ""
    var token = Keychain.get("token")
    var loggedIn: Bool { token != nil }

    var tab: Tab = .home
    var boot: Boot?
    var summary: Summary?
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
    var week: Week?
    var menuOpen = false
    /// Fargeflekker bak glasset (av/på i profilmenyen).
    private(set) var colorBg = UserDefaults.standard.object(forKey: "fh_ios_bg") as? Bool ?? true
    func setColorBg(_ on: Bool) { colorBg = on; UserDefaults.standard.set(on, forKey: "fh_ios_bg") }
    @ObservationIgnored private var logos: [String: UIImage] = [:]
    @ObservationIgnored private var polling = false

    private var api: API { API(base: server, token: token) }

    private func run(_ work: @escaping () async throws -> Void) {
        Task {
            do { try await work() } catch let e as APIError where e.status == 401 && loggedIn {
                clear(); message = "Innloggingen er utløpt"
            } catch { message = error.localizedDescription }
        }
    }

    func flash(_ text: String) {
        message = text
        Task { try? await Task.sleep(for: .seconds(2)); if message == text { message = nil } }
    }

    func login(server raw: String, password: String) {
        run {
            self.busy = true
            defer { self.busy = false }
            let base = API.normalize(raw)
            let t = try await API.login(base: base, password: password, device: UIDevice.current.name)
            Keychain.set("server", base); Keychain.set("token", t)
            self.server = base; self.token = t
            try await self.reload()
        }
    }

    func logout() {
        run {
            _ = try? await self.api.call("POST", "/auth/logout")
            self.clear()
        }
    }

    private func clear() {
        Keychain.set("token", nil)
        token = nil; boot = nil; summary = nil; txs = nil; receipts = nil; week = nil; jobs = []
    }

    func reload() async throws {
        boot = try await api.get("/bootstrap")
        summary = try await api.get("/summary")
        switch tab {
        case .list, .budget: try await loadTx()
        case .scan: try await loadReceipts(); await loadJobs()
        case .mat: try await loadWeek()
        default: break
        }
    }

    func refresh() { run { try await self.reload() } }

    func go(_ t: Tab) {
        if t != tab { selectedTx = nil }
        tab = t
        run {
            switch t {
            case .list, .budget: if self.txs == nil { try await self.loadTx() }
            case .scan: try await self.loadReceipts(); await self.loadJobs()
            case .mat: try await self.loadWeek()
            default: self.summary = try await self.api.get("/summary")
            }
        }
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

    /// Flere filer legges i kø og lastes opp én og én; AI-en leser dem i bakgrunnen på serveren.
    enum Upload { case image(UIImage), pdf(Data) }
    func upload(_ files: [Upload]) {
        guard !files.isEmpty else { return }
        uploading += files.count
        tab = .scan
        Task {
            for f in files {
                do {
                    switch f {
                    case .image(let img): try await self.sendImage(img)
                    case .pdf(let d): try await self.finishUpload([API.Part(name: "file", filename: "kvittering.pdf", mime: "application/pdf", data: d)])
                    }
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

    /// Originalen lastes opp urørt, sammen med en 1600 px JPEG til AI-en og et miniatyrbilde.
    private func sendImage(_ image: UIImage) async throws {
        do {
            guard let original = image.jpegData(compressionQuality: 0.92) else { return }
            var parts = [API.Part(name: "file", filename: "kvittering.jpg", mime: "image/jpeg", data: original)]
            if let s = image.scaled(max: 1600).jpegData(compressionQuality: 0.85) { parts.append(.init(name: "scan", filename: "scan.jpg", mime: "image/jpeg", data: s)) }
            if let t = image.scaled(max: 240).jpegData(compressionQuality: 0.75) { parts.append(.init(name: "thumb", filename: "thumb.jpg", mime: "image/jpeg", data: t)) }
            try await self.finishUpload(parts)
        }
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
}

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
