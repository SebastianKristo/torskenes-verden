import SwiftUI
import UIKit

/* ---------------- Venter på opplasting (prompt 18) ---------------- */

/// En kvittering som ikke kom fram (uten nett, tapt forbindelse eller serverfeil). Filen ligger i Application Support,
/// så køen overlever at appen lukkes. Den lastes opp av seg selv når nettet er tilbake og ved oppstart.
struct PendingUpload: Codable, Identifiable, Hashable {
    var id: String
    var created: Date
    /// "image" eller "pdf"
    var kind: String
    var file: String
    var folderId: Int?
    var attempts: Int
    var lastError: String?
    /// Prompt 21: kontoen som la filen i køen (AcctScope-nøkkel). Bare den kontoen laster den opp.
    var accountId: String?
    /// Prompt 47: ferdig tolket på iPhonen (JSON-feltet «data» til POST /receipts/parsed). nil = vanlig opplasting til Glimt.
    var parsed47: String? = nil
}

enum PendingQueue {
    static var dir: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first ?? FileManager.default.temporaryDirectory
        let d = base.appendingPathComponent("UploadQueue", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }
    static var indexURL: URL { dir.appendingPathComponent("queue.json") }

    static func load() -> [PendingUpload] {
        guard let d = try? Data(contentsOf: indexURL) else { return [] }
        let dec = JSONDecoder()
        dec.dateDecodingStrategy = .iso8601
        let list = (try? dec.decode([PendingUpload].self, from: d)) ?? []
        // Bare oppføringer der filen fortsatt finnes.
        return list.filter { FileManager.default.fileExists(atPath: dir.appendingPathComponent($0.file).path) }
    }
    static func save(_ list: [PendingUpload]) {
        let enc = JSONEncoder()
        enc.dateEncodingStrategy = .iso8601
        if let d = try? enc.encode(list) { try? d.write(to: indexURL, options: .atomic) }
    }
    static func write(_ data: Data, ext: String) -> String? {
        let name = UUID().uuidString + "." + ext
        do { try data.write(to: dir.appendingPathComponent(name), options: .atomic); return name } catch { return nil }
    }
    static func read(_ p: PendingUpload) -> Data? { try? Data(contentsOf: dir.appendingPathComponent(p.file)) }
    static func delete(_ p: PendingUpload) { try? FileManager.default.removeItem(at: dir.appendingPathComponent(p.file)) }
}

extension Store {
    /// Legger filen i køen «Venter på opplasting».
    func enqueuePending(_ f: Upload, folder: Int?, error: String?, parsed47: String? = nil) {
        let data: Data?
        let kind: String
        let ext: String
        switch f {
        case .image(let img):
            data = img.jpegData(compressionQuality: 0.92); kind = "image"; ext = "jpg"
        case .pdf(let d):
            data = d; kind = "pdf"; ext = "pdf"
        }
        guard let data, let name = PendingQueue.write(data, ext: ext) else { return }
        let owner: String? = account?.scopeKey
        let item = PendingUpload(id: UUID().uuidString, created: Date(), kind: kind, file: name, folderId: folder, attempts: 0, lastError: error, accountId: owner,
                                 parsed47: parsed47)
        pendingUploads.append(item)
        PendingQueue.save(pendingUploads)
    }

    /// Prøver å laste opp alt som venter. Stopper ved første nettverksfeil (da er det ingen vits å prøve resten nå).
    func flushPending() async {
        let mine: [PendingUpload] = myPendingUploads
        if pendingBusy || mine.isEmpty || !canUploadNow || !loggedIn { return }
        pendingBusy = true
        defer { pendingBusy = false }
        var done = 0
        for item in mine {
            guard let data = PendingQueue.read(item) else { removePending(item.id); continue }
            var parts: [API.Part]
            if item.kind == "pdf" {
                parts = [API.Part(name: "file", filename: "kvittering.pdf", mime: "application/pdf", data: data)]
            } else if let img = UIImage(data: data) {
                parts = uploadParts(img)
            } else { removePending(item.id); continue }
            var path = item.folderId.map { "/folders/\($0)/receipts" } ?? "/receipts"
            // Prompt 47: tolket på iPhonen – resultatet sendes med bildet som vedlegg (miniatyr, ikke AI-kopien).
            let plain: [API.Part] = parts
            if let p47 = item.parsed47, item.folderId == nil {
                parts = [API.Part.text("data", p47)] + parts.filter { $0.name != "scan" }
                path = "/receipts/parsed"
            }
            do {
                do {
                    _ = try await api.upload(path, parts: parts)
                } catch let e as APIError where path == "/receipts/parsed" && (e.status == 404 || e.status == 405) {
                    // Eldre server: bildet tolkes av Glimt i stedet.
                    _ = try await api.upload("/receipts", parts: plain)
                }
                PendingQueue.delete(item)
                pendingUploads.removeAll { $0.id == item.id }
                done += 1
            } catch {
                let status = (error as? APIError)?.status ?? 0
                if let i = pendingUploads.firstIndex(where: { $0.id == item.id }) {
                    pendingUploads[i].attempts += 1
                    pendingUploads[i].lastError = error.localizedDescription
                }
                PendingQueue.save(pendingUploads)
                // Uten nett eller serverfeil: prøv igjen senere. En 4xx-feil gjelder bare denne filen, så fortsett med neste.
                if status == 0 || status >= 500 { break }
            }
        }
        PendingQueue.save(pendingUploads)
        if done > 0 {
            flash(done == 1 ? "1 kvittering fra køen er lastet opp" : "\(done) kvitteringer fra køen er lastet opp")
            try? await loadReceipts()
            await loadJobs()
        }
    }

    func retryPending(_ id: String) {
        if let i = pendingUploads.firstIndex(where: { $0.id == id }) { pendingUploads[i].lastError = nil }
        Task { await self.flushPending() }
    }
    func removePending(_ id: String) {
        if let p = pendingUploads.first(where: { $0.id == id }) { PendingQueue.delete(p) }
        pendingUploads.removeAll { $0.id == id }
        PendingQueue.save(pendingUploads)
    }
    func pendingThumb(_ p: PendingUpload) -> UIImage? {
        guard p.kind == "image", let d = PendingQueue.read(p) else { return nil }
        return UIImage(data: d)?.scaled(max: 120)
    }
}

/// Listen «Venter på opplasting» med «Prøv igjen» og «Fjern». Vises i Kvitteringer (Klassisk) og i skanne-arket (Papir).
struct PendingUploadsList: View {
    @Environment(Store.self) private var store
    var body: some View {
        if !store.myPendingUploads.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Venter på opplasting · \(store.myPendingUploads.count)").font(.footnote.weight(.semibold)).foregroundStyle(Color.skinFg.opacity(0.75))
                    Spacer()
                    Button("Prøv alle") { Task { await store.flushPending() } }.font(.footnote.weight(.semibold))
                }
                ForEach(store.myPendingUploads) { p in row(p) }
                Text(store.wifiOnly && !store.onWifi ? "Lastes opp når du er på Wi-Fi." : "Lastes opp av seg selv når forbindelsen er tilbake.")
                    .font(.caption).foregroundStyle(Color.skinFg.opacity(0.55))
            }
            .padding(14)
            .glass(18)
        }
    }

    private func row(_ p: PendingUpload) -> some View {
        HStack(spacing: 10) {
            PendingThumb(item: p)
            VStack(alignment: .leading, spacing: 2) {
                Text((p.kind == "pdf" ? "PDF-kvittering" : "Kvittering") + (p.parsed47 != nil ? " · tolket på iPhone" : "")).font(.subheadline.weight(.semibold)).foregroundStyle(Color.skinFg)
                Text(sub(p)).font(.caption).foregroundStyle(Color.skinFg.opacity(0.6)).lineLimit(2)
            }
            Spacer(minLength: 4)
            Button { store.retryPending(p.id) } label: { Image(systemName: "arrow.clockwise") }
                .buttonStyle(.plain).foregroundStyle(Color.accent).accessibilityLabel("Prøv igjen")
            Button { store.removePending(p.id) } label: { Image(systemName: "trash") }
                .buttonStyle(.plain).foregroundStyle(Color.skinFg.opacity(0.6)).accessibilityLabel("Fjern")
        }
    }

    private func sub(_ p: PendingUpload) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.dateFormat = "d. MMM HH:mm"
        var s = "Lagt i kø " + f.string(from: p.created)
        if p.attempts > 0 { s += " · \(p.attempts) forsøk" }
        if let e = p.lastError, !e.isEmpty { s += " · " + e }
        return s
    }
}

private struct PendingThumb: View {
    @Environment(Store.self) private var store
    let item: PendingUpload
    @State private var img: UIImage? = nil
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Color.skinFg.opacity(0.08))
            if let img {
                Image(uiImage: img).resizable().scaledToFill()
            } else {
                Image(systemName: item.kind == "pdf" ? "doc.richtext" : "photo").foregroundStyle(Color.skinFg.opacity(0.6))
            }
        }
        .frame(width: 40, height: 40)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .task(id: item.id) { img = store.pendingThumb(item) }
    }
}
