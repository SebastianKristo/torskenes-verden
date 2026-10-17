import Foundation
import SwiftUI
import UIKit

enum Tab: String, CaseIterable, Identifiable {
    case home = "Hjem", list = "Liste", budget = "Budsjett", scan = "Skann", me = "Meg"
    var id: String { rawValue }
    var icon: String {
        switch self {
        case .home: "house"
        case .list: "list.bullet"
        case .budget: "chart.pie"
        case .scan: "doc.viewfinder"
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
            var base = raw.trimmingCharacters(in: .whitespaces)
            if !base.hasPrefix("http") { base = "https://" + base }
            while base.hasSuffix("/") { base.removeLast() }
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
        token = nil; boot = nil; summary = nil; txs = nil; receipts = nil
    }

    func reload() async throws {
        boot = try await api.get("/bootstrap")
        summary = try await api.get("/summary")
        switch tab {
        case .list, .budget: try await loadTx()
        case .scan: try await loadReceipts()
        default: break
        }
    }

    func refresh() { run { try await self.reload() } }

    func go(_ t: Tab) {
        tab = t
        run {
            switch t {
            case .list, .budget: if self.txs == nil { try await self.loadTx() }
            case .scan: try await self.loadReceipts()
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

    /// Originalen lastes opp urørt, sammen med en 1600 px JPEG til AI-en og et miniatyrbilde.
    func upload(image: UIImage) {
        run {
            self.busy = true
            defer { self.busy = false }
            guard let original = image.jpegData(compressionQuality: 0.92) else { return }
            var parts = [API.Part(name: "file", filename: "kvittering.jpg", mime: "image/jpeg", data: original)]
            if let s = image.scaled(max: 1600).jpegData(compressionQuality: 0.85) { parts.append(.init(name: "scan", filename: "scan.jpg", mime: "image/jpeg", data: s)) }
            if let t = image.scaled(max: 240).jpegData(compressionQuality: 0.75) { parts.append(.init(name: "thumb", filename: "thumb.jpg", mime: "image/jpeg", data: t)) }
            try await self.finishUpload(parts)
        }
    }

    func upload(pdf: Data) {
        run {
            self.busy = true
            defer { self.busy = false }
            try await self.finishUpload([API.Part(name: "file", filename: "kvittering.pdf", mime: "application/pdf", data: pdf)])
        }
    }

    private func finishUpload(_ parts: [API.Part]) async throws {
        let d = try await api.upload("/receipts", parts: parts)
        let r = try JSONDecoder().decode(Receipt.self, from: d)
        selectedReceipt = r.id
        tab = .scan
        try await loadReceipts()
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
