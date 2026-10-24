import SwiftUI
import UIKit
import UniformTypeIdentifiers

/* ---------------- Prompt 50: Chat – slipp filer i chatten + miniatyrbilde i meldingen ----------------
 Fasit: claude-code-chat-slipp-filer-og-miniatyr.md og web-implementasjonen public/js/chat50.js. Server-API: SRVCHAT50.
 – Vedlegg lastes opp med en gang (POST /api/chat/files, fremdrift) → {id, kind, thumb, url, w, h}. Meldingen sender bare id-er
   (`attachments`), aldri base64. Eldre server (404): bildet sendes som før (base64 i `images`).
 – Miniatyrrad over feltet: 64×64, radius 12, rund × (22), tynn fremdriftslinje nederst; PDF/andre filer som kort med filtype + navn.
   Send er av til alt er lastet opp. Maks 10 filer, maks 20 MB («Filen er for stor (maks 20 MB)»).
 – Brukerens boble: ett bilde maks 240×240 (radius 16), flere i rutenett 2 × 120 med 4 pt mellomrom. Trykk = lysboks
   (Lukk, Del/Last ned, sveip mellom bildene, sveip ned lukker). Originalen hentes først i lysboksen.
 – Svaret: «Lest med …»-linje (meta.readWith.label), miniatyr-piller (28 pt) for bildene som ble lest, kvitteringstabell
   (markdown-tabell) og «Legg i Finans ›» (POST /api/chat/files/:id/finans).
 – iPad/Fold: dra og slipp over hele chatten (`onDrop`) med laget «Slipp for å legge ved». Telefon: «Lim inn bilde» når
   utklippstavlen har et bilde, i tillegg til + (Bilder, Kamera, Filer). */

/// Et lagret vedlegg i en melding (GET /api/chat/chats/:id → messages[i].attachments).
struct Chat50File: Identifiable, Hashable {
    var id: String
    var name: String = ""
    var mime: String = ""
    var kind: String = "file"          // image | pdf | file
    var thumb: String = ""
    var url: String = ""
    var w: Int = 0
    var h: Int = 0
    /// Lokal forhåndsvisning (vedleggets id i skrivefeltet) – vises før miniatyren er hentet.
    var preview: String = ""

    var isImage: Bool { kind == "image" || mime.hasPrefix("image/") }

    nonisolated static func list(_ l: [[String: Any]]) -> [Chat50File] {
        l.compactMap { (o: [String: Any]) -> Chat50File? in
            guard let id = JS.str(o, "id") else { return nil }
            var f: Chat50File = Chat50File(id: id)
            f.name = JS.str(o, "name") ?? "Bilde"
            f.mime = JS.str(o, "mime") ?? ""
            f.kind = JS.str(o, "kind") ?? (f.mime.hasPrefix("image/") ? "image" : "file")
            f.url = JS.str(o, "url") ?? "/api/chat/files/\(id)"
            f.thumb = JS.str(o, "thumb") ?? (f.kind == "image" ? f.url + "/thumb" : "")
            f.w = JS.int(o, "w") ?? 0
            f.h = JS.int(o, "h") ?? 0
            return f
        }
    }
}

/// Et bilde i lysboksen.
struct Chat50LBItem: Identifiable, Hashable {
    var id: String
    var name: String
    var thumb: String = ""
    var url: String = ""
    var preview: String = ""
    /// Eldre melding med base64-bilde (bare i denne økten).
    var b64: String = ""
    var w: Int = 0
    var h: Int = 0
}

struct Chat50LB: Identifiable {
    let id: String = UUID().uuidString
    let items: [Chat50LBItem]
    let start: Int
}

@MainActor
@Observable
final class Chat50 {
    static let shared = Chat50()

    var lightbox: Chat50LB? = nil
    var dropOn: Bool = false
    /// «Legg i Finans»: melding-id → busy | ok.
    var fin: [String: String] = [:]
    /// Lokale forhåndsvisninger (vedleggets id → bilde) til miniatyren fra serveren er hentet.
    var previews: [String: UIImage] = [:]
    @ObservationIgnored private var metaReadWith: String = ""
    private let b64Cache: NSCache<NSString, UIImage> = NSCache<NSString, UIImage>()

    nonisolated static let maxBytes: Int = 20 * 1024 * 1024
    nonisolated static let maxFiles: Int = 10

    /* ---------- Opplasting med fremdrift ---------- */

    private func mutate(_ aid: String, _ f: (inout ChatAttach27) -> Void) {
        let s: ChatStore27 = ChatStore27.shared
        guard let i = s.attach.firstIndex(where: { $0.id == aid }) else { return }
        var a: ChatAttach27 = s.attach[i]
        f(&a)
        s.attach[i] = a
    }

    /// Plass til ett vedlegg til? Viser meldingen når det er fullt.
    func room() -> Bool {
        if ChatStore27.shared.attach.count >= Chat50.maxFiles {
            ChatStore27.shared.flash("Maks \(Chat50.maxFiles) vedlegg per melding")
            return false
        }
        return true
    }

    /// Legger vedlegget i raden og laster det opp. Bilder: `preview` vises med en gang.
    func upload(_ a: ChatAttach27, data: Data, preview: UIImage?, api: API) {
        if data.count > Chat50.maxBytes {
            ChatStore27.shared.flash("Filen er for stor (maks 20 MB)")
            return
        }
        if !room() { return }
        var x: ChatAttach27 = a
        x.uploading = true
        x.pct = 0.02
        if let preview { previews[x.id] = preview }
        ChatStore27.shared.attach.append(x)
        let aid: String = x.id
        let name: String = x.name
        let mime: String = x.mime
        Task { @MainActor in
            do {
                let o: [String: Any] = try await Chat50.post(api, data, name, mime) { (p: Double) in
                    Task { @MainActor in Chat50.shared.mutate(aid) { $0.pct = Swift.max($0.pct, Swift.min(0.99, p)) } }
                }
                let thumb: String = JS.str(o, "thumb") ?? ""
                // Den lokale forhåndsvisningen brukes som miniatyr til serverens miniatyr er hentet (ingen blink i boblen).
                if !thumb.isEmpty, let pv = self.previews[aid] {
                    Img50Cache.shared.mem.setObject(pv, forKey: Img50Cache.key(thumb) as NSString)
                }
                self.mutate(aid) { (v: inout ChatAttach27) in
                    v.fileId = JS.str(o, "id") ?? ""
                    v.thumb = thumb
                    v.name = JS.str(o, "name") ?? v.name
                    if (JS.str(o, "kind") ?? "") == "image" { v.kind = "img" }
                    v.uploading = false
                    v.pct = 1
                    v.err = v.fileId.isEmpty ? "Uventet svar fra serveren" : ""
                }
            } catch let e as APIError where e.status == 404 && mime.hasPrefix("image/") {
                // Eldre server uten /api/chat/files: bildet sendes som før (base64 i meldingen).
                self.mutate(aid) { (v: inout ChatAttach27) in
                    v.b64 = data.base64EncodedString()
                    v.uploading = false
                    v.pct = 1
                }
            } catch {
                let msg: String = (error as? APIError)?.message ?? "Fikk ikke lastet opp \(name)"
                self.mutate(aid) { (v: inout ChatAttach27) in
                    v.uploading = false
                    v.err = msg
                }
                ChatStore27.shared.flash(msg)
            }
        }
    }

    /// Multipart til /api/chat/files med fremdrift fra URLSession.
    nonisolated static func post(_ api: API, _ data: Data, _ name: String, _ mime: String,
                                 onPct: @escaping @Sendable (Double) -> Void) async throws -> [String: Any] {
        guard let url = URL(string: api.base.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/api/chat/files") else {
            throw APIError(message: "Ugyldig serveradresse", status: 0)
        }
        let boundary: String = "Chat50-\(UUID().uuidString)"
        let safe: String = name.replacingOccurrences(of: "\"", with: "'").replacingOccurrences(of: "\r", with: "").replacingOccurrences(of: "\n", with: "")
        var body: Data = Data()
        body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"\(safe)\"\r\nContent-Type: \(mime.isEmpty ? "application/octet-stream" : mime)\r\n\r\n".utf8))
        body.append(data)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))
        var r: URLRequest = URLRequest(url: url)
        r.httpMethod = "POST"
        r.timeoutInterval = 180
        r.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        if let t = api.token { r.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        let d: Data
        let res: URLResponse
        do {
            (d, res) = try await URLSession.shared.upload(for: r, from: body, delegate: Chat50Progress(onPct))
        } catch {
            throw APIError(message: "Fikk ikke lastet opp \(name). Sjekk nettet.", status: 0)
        }
        let code: Int = (res as? HTTPURLResponse)?.statusCode ?? 0
        let o: [String: Any] = JS.obj(d)
        if code >= 400 {
            let msg: String = JS.str(o, "error") ?? (code == 413 ? "Filen er for stor (maks 20 MB)" : "Feil \(code)")
            throw APIError(message: msg, status: code, code: JS.str(o, "code") ?? JS.str(o, "kode"))
        }
        onPct(1)
        return o
    }

    /* ---------- Dra og slipp, lim inn ---------- */

    /// Filer fra dra og slipp (iPad/Fold). Bilder blir JPEG (som fra Bilder), andre filer sendes som de er.
    func drop(_ providers: [NSItemProvider], api: API) {
        for p in providers.prefix(Chat50.maxFiles) {
            let name: String = p.suggestedName ?? "Fil"
            if p.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
                _ = p.loadDataRepresentation(forTypeIdentifier: UTType.image.identifier) { (d: Data?, _: Error?) in
                    guard let d, let img = UIImage(data: d) else { return }
                    Task { @MainActor in ChatStore27.shared.addImage(img) }
                }
            } else {
                let type: String = p.registeredTypeIdentifiers.first(where: { UTType($0)?.conforms(to: .data) == true }) ?? UTType.data.identifier
                _ = p.loadFileRepresentation(forTypeIdentifier: type) { (u: URL?, _: Error?) in
                    guard let u else { return }
                    let size: Int = (try? u.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
                    if size > Chat50.maxBytes {
                        Task { @MainActor in ChatStore27.shared.flash("Filen er for stor (maks 20 MB)") }
                        return
                    }
                    guard let d = try? Data(contentsOf: u) else { return }
                    let fname: String = name.contains(".") ? name : name + (u.pathExtension.isEmpty ? "" : "." + u.pathExtension)
                    let mime: String = UTType(type)?.preferredMIMEType ?? ChatStore27.mime(u.pathExtension)
                    Task { @MainActor in
                        Chat50.shared.upload(ChatAttach27(name: fname, kind: "file", mime: mime), data: d, preview: nil, api: api)
                    }
                }
            }
        }
        if providers.count > Chat50.maxFiles { ChatStore27.shared.flash("Maks \(Chat50.maxFiles) vedlegg per melding") }
    }

    /// Bilder fra utklippstavlen.
    func paste() {
        let imgs: [UIImage] = UIPasteboard.general.images ?? []
        if imgs.isEmpty { ChatStore27.shared.flash("Utklippstavlen har ikke noe bilde"); return }
        for i in imgs.prefix(Chat50.maxFiles) { ChatStore27.shared.addImage(i) }
        Haptics.shared.success()
    }

    /* ---------- Meldingene ---------- */

    /// SSE meta: husk «Lest med …» til svaret er ferdig.
    func noteMeta(_ o: [String: Any]) {
        if let l = JS.str(JS.dict(o, "readWith"), "label") { metaReadWith = l }
    }

    /// done / lagret meta → «Lest med …» og «Legg i Finans ›».
    func apply(_ a: inout ChatMsg27, _ meta: [String: Any]?) {
        a.readWith50 = JS.str(JS.dict(meta, "readWith"), "label") ?? metaReadWith
        let act: [String: Any]? = JS.dict(JS.dict(meta, "receipt"), "action")
        a.fin50 = JS.str(act, "url") ?? ""
        a.fin50Label = JS.str(act, "label") ?? "Legg i Finans ›"
        metaReadWith = ""
    }

    func clearMeta() { metaReadWith = "" }

    /// Bildene i en melding (vedlegg og eldre base64).
    func items(_ m: ChatMsg27) -> [Chat50LBItem] {
        var out: [Chat50LBItem] = m.att50.filter(\.isImage).map { (f: Chat50File) -> Chat50LBItem in
            Chat50LBItem(id: f.id, name: f.name, thumb: f.thumb, url: f.url, preview: f.preview, w: f.w, h: f.h)
        }
        for (i, b) in m.images.enumerated() {
            out.append(Chat50LBItem(id: m.id + "#\(i)", name: "Bilde \(i + 1)", b64: b))
        }
        return out
    }

    /// Bildene som svaret leste: fra brukermeldingen rett før.
    func itemsBefore(_ index: Int) -> [Chat50LBItem] {
        let msgs: [ChatMsg27] = ChatStore27.shared.msgs
        guard index > 0, index - 1 < msgs.count else { return [] }
        let u: ChatMsg27 = msgs[index - 1]
        return u.role == "user" ? items(u) : []
    }

    /// Bildet som vises nå uten nett: lokal forhåndsvisning, base64 eller miniatyren fra minnet.
    func localImage(_ it: Chat50LBItem) -> UIImage? {
        if !it.preview.isEmpty, let p = previews[it.preview] { return p }
        if !it.b64.isEmpty {
            if let c = b64Cache.object(forKey: it.id as NSString) { return c }
            if let d = Data(base64Encoded: it.b64), let img = UIImage(data: d) {
                b64Cache.setObject(img, forKey: it.id as NSString)
                return img
            }
        }
        return Img50Cache.shared.memory(it.thumb)
    }

    func open(_ items: [Chat50LBItem], _ i: Int) {
        Haptics.shared.tap()
        lightbox = Chat50LB(items: items, start: i)
    }

    /// «Legg i Finans ›» under kvitteringstabellen.
    func addToFinans(_ m: ChatMsg27, _ store: Store) {
        if fin[m.id] != nil || m.fin50.isEmpty { return }
        Haptics.shared.tap()
        fin[m.id] = "busy"
        var path: String = m.fin50
        if path.hasPrefix("/api/") { path = String(path.dropFirst(4)) }
        Task { @MainActor in
            do {
                _ = try await store.api.callAt("/api", "POST", path, json: [:], timeout: 30)
                self.fin[m.id] = "ok"
                Haptics.shared.success()
                ChatStore27.shared.flash("Lagt i Finans – kvitteringen er i køen")
            } catch let e as APIError {
                self.fin[m.id] = nil
                ChatStore27.shared.flash(e.code == "bilde_mangler" || e.status == 404 ? "Originalbildet finnes ikke lenger. Last opp kvitteringen på nytt." : e.message)
            } catch {
                self.fin[m.id] = nil
                ChatStore27.shared.flash("Fikk ikke lagt kvitteringen i Finans")
            }
        }
    }
}

/// Fremdrift for opplastingen (URLSession kaller fra en bakgrunnstråd).
final class Chat50Progress: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    let onPct: @Sendable (Double) -> Void

    init(_ onPct: @escaping @Sendable (Double) -> Void) { self.onPct = onPct }

    func urlSession(_ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64, totalBytesSent: Int64, totalBytesExpectedToSend: Int64) {
        guard totalBytesExpectedToSend > 0 else { return }
        onPct(Double(totalBytesSent) / Double(totalBytesExpectedToSend))
    }
}

/* ---------- Miniatyrraden over feltet ---------- */

struct Chat50AttachRow: View {
    @MainActor private var s: ChatStore27 { ChatStore27.shared }
    let c: ChatPal27

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(alignment: .top, spacing: 10) {
                ForEach(s.attach) { (a: ChatAttach27) in tile(a) }
            }
            .padding(.top, 8).padding(.trailing, 8).padding(.leading, 2)
        }
    }

    private func tile(_ a: ChatAttach27) -> some View {
        VStack(spacing: 3) {
            ZStack(alignment: .topTrailing) {
                face(a)
                    .frame(width: 64, height: 64)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(a.err.isEmpty ? c.line : Color(hex: "#b23a2a"), lineWidth: a.err.isEmpty ? 1 : 2))
                    .overlay(alignment: .bottom) { if a.uploading { progress(a.pct) } }
                Button { s.removeAttach(a) } label: {
                    Text("✕").font(.system(size: 11, weight: .bold)).foregroundStyle(c.bg)
                        .frame(width: 22, height: 22)
                        .background(c.ink, in: Circle())
                        .frame(width: 32, height: 32)
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .offset(x: 11, y: -11)
                .accessibilityLabel("Fjern " + a.name)
            }
            if a.kind != "img" {
                Text(a.name).font(c.ui(10.5)).foregroundStyle(c.mut).lineLimit(1).truncationMode(.middle).frame(width: 64)
            }
        }
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private func face(_ a: ChatAttach27) -> some View {
        if a.kind == "img", let img = Chat50.shared.previews[a.id] {
            Image(uiImage: img).resizable().scaledToFill()
        } else if a.kind == "img", !a.thumb.isEmpty {
            ZStack { c.card; Media50Remote(url: a.thumb, want: 480) }
        } else {
            ZStack {
                c.card
                Text(a.kind == "doc" ? "KB" : Chat50AttachRow.ext(a.name)).font(c.mono(12)).tracking(0.8).foregroundStyle(c.mut)
            }
        }
    }

    private func progress(_ v: Double) -> some View {
        GeometryReader { (g: GeometryProxy) in
            ZStack(alignment: .leading) {
                Rectangle().fill(Color.black.opacity(0.12))
                Rectangle().fill(Color(hex: "#b23a2a")).frame(width: g.size.width * CGFloat(Swift.max(0.02, Swift.min(1, v))))
            }
        }
        .frame(height: 3)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .animation(.easeOut(duration: 0.2), value: v)
    }

    nonisolated static func ext(_ n: String) -> String {
        let e: String = (n as NSString).pathExtension
        return e.isEmpty || e.count > 5 ? "FIL" : e.uppercased()
    }
}

/// «Lim inn bilde» når utklippstavlen har et bilde (telefon og iPad).
struct Chat50PasteChip: View {
    let c: ChatPal27
    @State private var has: Bool = UIPasteboard.general.hasImages

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if has {
                Button {
                    has = false
                    Chat50.shared.paste()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "doc.on.clipboard").font(.system(size: 12, weight: .semibold))
                        Text("Lim inn bilde").font(c.ui(12.5, .semibold))
                    }
                    .foregroundStyle(c.ink)
                    .padding(.horizontal, 12).frame(height: 32)
                    .background(c.card, in: Capsule())
                    .overlay(Capsule().stroke(c.line, lineWidth: 1))
                    .frame(minHeight: 44)
                    .contentShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIPasteboard.changedNotification)) { _ in has = UIPasteboard.general.hasImages }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)) { _ in has = UIPasteboard.general.hasImages }
    }
}

/* ---------- Bilder i boblen, piller ved svaret, lysboks ---------- */

/// Ett bilde (miniatyr): lokal forhåndsvisning/base64 med en gang, ellers miniatyren fra serveren (disk- og minnecache).
struct Chat50Thumb: View {
    let it: Chat50LBItem
    let c: ChatPal27

    var body: some View {
        ZStack {
            c.card
            if let img = Chat50.shared.localImage(it) {
                Image(uiImage: img).resizable().scaledToFill()
            } else if !it.thumb.isEmpty {
                Media50Remote(url: it.thumb, want: 480)
            }
        }
    }
}

struct Chat50BubbleImages: View {
    let m: ChatMsg27
    let c: ChatPal27

    var body: some View {
        let list: [Chat50LBItem] = Chat50.shared.items(m)
        if list.count == 1 {
            one(list[0], list)
        } else if list.count > 1 {
            LazyVGrid(columns: [GridItem(.fixed(120), spacing: 4), GridItem(.fixed(120), spacing: 4)], alignment: .trailing, spacing: 4) {
                ForEach(Array(list.enumerated()), id: \.element.id) { (pair: (offset: Int, element: Chat50LBItem)) in
                    Button { Chat50.shared.open(list, pair.offset) } label: {
                        Chat50Thumb(it: pair.element, c: c)
                            .frame(width: 120, height: 120)
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Åpne " + pair.element.name)
                }
            }
            .frame(width: 244, alignment: .trailing)
        }
    }

    /// Ett bilde: maks 240 × 240 med riktig forhold (fra serverens w/h eller bildet selv), så layouten ikke hopper.
    private func one(_ it: Chat50LBItem, _ list: [Chat50LBItem]) -> some View {
        var w: CGFloat = CGFloat(it.w), h: CGFloat = CGFloat(it.h)
        if w <= 0 || h <= 0, let img = Chat50.shared.localImage(it) { w = img.size.width; h = img.size.height }
        if w <= 0 || h <= 0 { w = 240; h = 180 }
        let k: CGFloat = Swift.min(240 / w, 240 / h)
        let size: CGSize = CGSize(width: Swift.max(80, w * k), height: Swift.max(80, h * k))
        return Button { Chat50.shared.open(list, 0) } label: {
            Chat50Thumb(it: it, c: c)
                .frame(width: size.width, height: size.height)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Åpne " + it.name)
    }
}

/// Små miniatyrer (28 pt, radius 6) + filnavn ved svaret; trykk åpner lysboksen.
struct Chat50FilePills: View {
    let items: [Chat50LBItem]
    let c: ChatPal27

    var body: some View {
        Flow(spacing: 6) {
            ForEach(Array(items.enumerated()), id: \.element.id) { (pair: (offset: Int, element: Chat50LBItem)) in
                Button { Chat50.shared.open(items, pair.offset) } label: {
                    HStack(spacing: 6) {
                        Chat50Thumb(it: pair.element, c: c)
                            .frame(width: 28, height: 28)
                            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                        Text(pair.element.name).font(c.ui(12, .semibold)).foregroundStyle(c.mut).lineLimit(1).truncationMode(.middle)
                    }
                    .padding(.trailing, 10)
                    .frame(maxWidth: 220, alignment: .leading)
                    .overlay(Capsule().stroke(c.line, lineWidth: 1))
                    .clipShape(Capsule())
                    .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Åpne " + pair.element.name)
            }
        }
    }
}

/// «Lest med …» og «Legg i Finans ›» under svaret.
struct Chat50AnswerExtras: View {
    @Environment(Store.self) private var store
    let m: ChatMsg27
    let c: ChatPal27

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !m.fin50.isEmpty {
                let st: String = Chat50.shared.fin[m.id] ?? ""
                Button { Chat50.shared.addToFinans(m, store) } label: {
                    Text(st == "ok" ? "Lagt i Finans ✓" : st == "busy" ? "Legger i Finans …" : m.fin50Label)
                        .font(c.ui(13.5, .bold)).foregroundStyle(c.ink)
                        .padding(.horizontal, 14).frame(height: 36)
                        .overlay(Capsule().stroke(c.ink, lineWidth: 1))
                        .frame(minHeight: 44)
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .disabled(!st.isEmpty)
                .opacity(st.isEmpty ? 1 : 0.6)
            }
            if !m.readWith50.isEmpty {
                Text(m.readWith50).font(c.ui(12)).foregroundStyle(c.mut).fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

/// «Ser bilder» i modellvelgeren.
struct Chat50VisionBadge: View {
    let c: ChatPal27

    var body: some View {
        Text("SER BILDER").font(c.mono(9.5)).tracking(0.6).foregroundStyle(c.mut)
            .padding(.horizontal, 6).padding(.vertical, 3)
            .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).stroke(c.line, lineWidth: 1))
            .accessibilityLabel("Ser bilder")
    }
}

/// Lysboks: Lukk, Del (lagre/last ned via delingsarket), sveip mellom bildene, sveip ned lukker.
struct Chat50Lightbox: View {
    @Environment(Store.self) private var store
    let lb: Chat50LB
    @State private var idx: Int
    @State private var dragY: CGFloat = 0
    @State private var share: ChatShare27? = nil

    init(lb: Chat50LB) {
        self.lb = lb
        _idx = State(initialValue: Swift.max(0, Swift.min(lb.items.count - 1, lb.start)))
    }

    var body: some View {
        VStack(spacing: 0) {
            head
            TabView(selection: $idx) {
                ForEach(Array(lb.items.enumerated()), id: \.element.id) { (pair: (offset: Int, element: Chat50LBItem)) in
                    Chat50FullImage(it: pair.element).tag(pair.offset)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .offset(y: dragY)
            Text(lb.items.count > 1 ? "\(idx + 1) av \(lb.items.count)" : " ")
                .font(.system(size: 12, weight: .medium)).foregroundStyle(Color.white.opacity(0.7))
                .padding(.vertical, 10)
        }
        .background(Color(red: 10 / 255, green: 10 / 255, blue: 10 / 255).opacity(0.94).ignoresSafeArea())
        .environment(\.colorScheme, .dark)
        // Sveip ned lukker. Samtidig gest (TabView sveiper fortsatt sidelengs), bare onChanged for forskyvningen og onEnded.
        .simultaneousGesture(
            DragGesture(minimumDistance: 24)
                .onChanged { (v: DragGesture.Value) in
                    if v.translation.height > 0 && abs(v.translation.height) > abs(v.translation.width) { dragY = v.translation.height }
                }
                .onEnded { (v: DragGesture.Value) in
                    if v.translation.height > 90 && abs(v.translation.height) > abs(v.translation.width) { close() } else { withAnimation(.easeOut(duration: 0.18)) { dragY = 0 } }
                }
        )
        .sheet(item: $share) { (it: ChatShare27) in ShareSheet(url: it.url).presentationDetents([.medium, .large]) }
    }

    private var head: some View {
        let it: Chat50LBItem? = lb.items.indices.contains(idx) ? lb.items[idx] : nil
        return HStack(spacing: 10) {
            Text(it?.name ?? "Bilde").font(.system(size: 14, weight: .semibold)).foregroundStyle(.white).lineLimit(1)
            Spacer(minLength: 6)
            if let it { button("Del") { shareImage(it) } }
            button("Lukk") { close() }
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
    }

    private func button(_ t: String, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Text(t).font(.system(size: 14, weight: .semibold)).foregroundStyle(.white)
                .padding(.horizontal, 16).frame(height: 40)
                .background(Color.white.opacity(0.08), in: Capsule())
                .overlay(Capsule().stroke(Color.white.opacity(0.3), lineWidth: 1))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private func close() {
        Chat50.shared.lightbox = nil
    }

    /// Originalen (eller miniatyren) til en fil, så delingsarket kan lagre den i Bilder/Filer.
    private func shareImage(_ it: Chat50LBItem) {
        Haptics.shared.tap()
        Task { @MainActor in
            var img: UIImage? = Img50Cache.shared.memory(it.url) ?? Chat50.shared.localImage(it)
            if img == nil, !it.url.isEmpty { img = await Img50Cache.shared.load(it.url, api: store.api) }
            guard let img, let d = img.jpegData(compressionQuality: 0.92) else { return }
            var name: String = (it.name as NSString).deletingPathExtension
            if name.isEmpty { name = "Bilde" }
            let u: URL = FileManager.default.temporaryDirectory.appendingPathComponent(name + ".jpg")
            do { try d.write(to: u, options: .atomic); share = ChatShare27(url: u) } catch {}
        }
    }
}

/// Ett bilde i lysboksen: miniatyren med en gang, originalen hentes først nå.
struct Chat50FullImage: View {
    @Environment(Store.self) private var store
    let it: Chat50LBItem
    @State private var full: UIImage? = nil

    var body: some View {
        ZStack {
            if let img = full ?? Chat50.shared.localImage(it) {
                Image(uiImage: img).resizable().scaledToFit()
            } else {
                ProgressView().tint(.white)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .task(id: it.id) {
            guard it.b64.isEmpty, !it.url.isEmpty else { return }
            if let c = Img50Cache.shared.memory(it.url) { full = c; return }
            if let i = await Img50Cache.shared.load(it.url, api: store.api) { full = i }
        }
    }
}

/* ---------- Kvitteringstabell (markdown) i svaret ---------- */

struct Chat50Seg: Identifiable {
    let id: Int
    let text: String
    let rows: [[String]]
    let right: [Bool]
    var table: Bool { !rows.isEmpty }
}

enum Chat50Md {
    /// Deler teksten i vanlige avsnitt og markdown-tabeller (| a | b |).
    nonisolated static func split(_ t: String) -> [Chat50Seg] {
        var out: [Chat50Seg] = []
        var buf: [String] = []
        var tab: [String] = []
        func flushText() {
            let s: String = buf.joined(separator: "\n")
            if !s.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { out.append(Chat50Seg(id: out.count, text: s, rows: [], right: [])) }
            buf = []
        }
        func flushTable() {
            if tab.count >= 2, let tb = table(tab) { out.append(tb.with(out.count)) } else { buf.append(contentsOf: tab) }
            tab = []
        }
        var inCode: Bool = false
        for line in t.components(separatedBy: "\n") {
            let l: String = line.trimmingCharacters(in: .whitespaces)
            if l.hasPrefix("```") { inCode.toggle() }
            if !inCode && l.hasPrefix("|") {
                if tab.isEmpty { flushText() }
                tab.append(l)
            } else {
                if !tab.isEmpty { flushTable() }
                buf.append(line)
            }
        }
        if !tab.isEmpty { flushTable() }
        flushText()
        return out
    }

    nonisolated static func cells(_ l: String) -> [String] {
        var s: String = l
        if s.hasPrefix("|") { s.removeFirst() }
        if s.hasSuffix("|") { s.removeLast() }
        return s.components(separatedBy: "|").map { $0.trimmingCharacters(in: .whitespaces) }
    }

    nonisolated static func table(_ lines: [String]) -> Chat50Seg? {
        var rows: [[String]] = []
        var right: [Bool] = []
        for l in lines {
            let c: [String] = cells(l)
            let sep: Bool = !c.isEmpty && c.allSatisfy { $0.range(of: "^:?-{2,}:?$", options: .regularExpression) != nil }
            if sep { right = c.map { $0.hasSuffix(":") && !$0.hasPrefix(":") }; continue }
            rows.append(c)
        }
        if rows.isEmpty { return nil }
        let n: Int = rows.map(\.count).max() ?? 0
        rows = rows.map { $0 + Array(repeating: "", count: Swift.max(0, n - $0.count)) }
        right = right + Array(repeating: false, count: Swift.max(0, n - right.count))
        return Chat50Seg(id: 0, text: "", rows: rows, right: right)
    }
}

extension Chat50Seg {
    func with(_ id: Int) -> Chat50Seg { Chat50Seg(id: id, text: text, rows: rows, right: right) }
}

/// Svaret: avsnitt som før (Chat27Blocks) og tabeller som rutenett.
struct Chat50Body: View {
    let text: String
    let c: ChatPal27

    var body: some View {
        let segs: [Chat50Seg] = Chat50Md.split(text)
        if segs.contains(where: \.table) {
            VStack(alignment: .leading, spacing: 12) {
                ForEach(segs) { (sg: Chat50Seg) in
                    if sg.table { Chat50Table(seg: sg, c: c) } else { Chat27Blocks(text: sg.text, c: c) }
                }
            }
        } else {
            Chat27Blocks(text: text, c: c)
        }
    }
}

struct Chat50Table: View {
    let seg: Chat50Seg
    let c: ChatPal27

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            Grid(alignment: .leading, horizontalSpacing: 0, verticalSpacing: 0) {
                ForEach(Array(seg.rows.enumerated()), id: \.offset) { (pair: (offset: Int, element: [String])) in
                    GridRow {
                        ForEach(Array(pair.element.enumerated()), id: \.offset) { (cell: (offset: Int, element: String)) in
                            cellView(cell.element, head: pair.offset == 0, right: seg.right.indices.contains(cell.offset) && seg.right[cell.offset])
                        }
                    }
                    Rectangle().fill(c.line).frame(height: 1).gridCellUnsizedAxes(.horizontal)
                }
            }
        }
    }

    private func cellView(_ t: String, head: Bool, right: Bool) -> some View {
        ChatMd27.styled(t, bold: head, font: c.ui(13.5), boldFont: c.ui(13.5, .bold))
            .foregroundStyle(head ? c.mut : c.ink)
            .monospacedDigit()
            .lineLimit(2)
            .padding(.horizontal, 10).padding(.vertical, 6)
            .frame(maxWidth: .infinity, alignment: right ? .trailing : .leading)
            .gridColumnAlignment(right ? .trailing : .leading)
    }
}

/* ---------- Vertene: lysboks og dra-og-slipp ---------- */

struct Chat50Host: ViewModifier {
    @Environment(Store.self) private var store

    func body(content: Content) -> some View {
        content
            .fullScreenCover(item: Binding<Chat50LB?>(get: { Chat50.shared.lightbox }, set: { Chat50.shared.lightbox = $0 })) { (lb: Chat50LB) in
                Chat50Lightbox(lb: lb).environment(store)
            }
    }
}

struct Chat50Drop: ViewModifier {
    @Environment(Store.self) private var store
    let c: ChatPal27

    func body(content: Content) -> some View {
        content
            .onDrop(of: [UTType.image, UTType.pdf, UTType.plainText, UTType.data], isTargeted: Binding<Bool>(get: { Chat50.shared.dropOn }, set: { Chat50.shared.dropOn = $0 })) { (providers: [NSItemProvider]) -> Bool in
                if providers.isEmpty { return false }
                Chat50.shared.drop(providers, api: store.api)
                return true
            }
            .overlay { if Chat50.shared.dropOn { layer } }
            .animation(.easeOut(duration: 0.15), value: Chat50.shared.dropOn)
    }

    /// rgba(243,239,230,.92) med stiplet ramme (2 pt, radius 24, innfelt 16) og «Slipp for å legge ved».
    private var layer: some View {
        ZStack {
            (c.dark ? c.bg.opacity(0.92) : Color(red: 243 / 255, green: 239 / 255, blue: 230 / 255).opacity(0.92))
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .strokeBorder(c.dark ? c.ink : Color(hex: "#1b1a17"), style: StrokeStyle(lineWidth: 2, dash: [8, 6]))
                .padding(16)
            VStack(spacing: 6) {
                Text("Slipp for å legge ved").font(PF.serif(28, medium: true)).foregroundStyle(c.dark ? c.ink : Color(hex: "#1b1a17"))
                Text("Bilder, PDF, tekst · maks 20 MB").font(.system(size: 14)).foregroundStyle(c.dark ? c.mut : Color(hex: "#6b665c"))
            }
        }
        .allowsHitTesting(false)
        .transition(.opacity)
        .accessibilityHidden(true)
    }
}

extension View {
    func chat50Host() -> some View { modifier(Chat50Host()) }
    func chat50Drop(_ c: ChatPal27) -> some View { modifier(Chat50Drop(c: c)) }
}
