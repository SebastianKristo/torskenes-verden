import SwiftUI
import UIKit

/* ---------------- Prompt 23: Finn-annonsen i appen (Mobil Papir App.dc.html → Finans → Finn, fn.ad) ---------------- */

struct FinnAdAttr23: Hashable {
    var label: String
    var value: String
}

struct FinnAdMail23: Identifiable, Hashable {
    var id: String
    var from: String
    var subject: String
    var date: String
    var snippet: String
    var body: String?

    init(_ o: [String: Any]) {
        id = JS.str(o, "id") ?? (JS.int(o, "id").map { String($0) } ?? UUID().uuidString)
        from = JS.str(o, "from") ?? JS.str(o, "sender") ?? ""
        subject = JS.str(o, "subject") ?? "(uten emne)"
        date = JS.str(o, "date") ?? ""
        snippet = JS.str(o, "snippet") ?? ""
        body = JS.str(o, "body") ?? JS.str(o, "text")
    }

    init(_ m: FinnMail) {
        id = m.id
        from = m.from ?? ""
        subject = m.subject ?? "(uten emne)"
        date = m.date ?? ""
        snippet = m.snippet ?? ""
        body = m.body
    }
}

struct FinnAdMsg23: Hashable {
    var mine: Bool
    var text: String
    var time: String
}

/// GET /finans/api/finn/:id/ad → {title, price, description, attrs:[{label, value}], images:[url], url, fetchedAt, removed}.
struct FinnAdData23 {
    var title: String = ""
    var price: Double?
    var description: String = ""
    var attrs: [FinnAdAttr23] = []
    var images: [String] = []
    var url: String?
    var fetchedAt: String?
    var removed: Bool = false

    init() {}
    init(_ o: [String: Any]) {
        title = JS.str(o, "title") ?? ""
        price = JS.num(o, "price")
        description = JS.str(o, "description") ?? ""
        attrs = JS.list(o, "attrs").compactMap { a -> FinnAdAttr23? in
            guard let l = JS.str(a, "label"), let v = JS.str(a, "value") ?? JS.num(a, "value").map({ n0($0) }), !l.isEmpty, !v.isEmpty else { return nil }
            return FinnAdAttr23(label: l, value: v)
        }
        images = JS.strings(o, "images")
        if images.isEmpty { images = JS.list(o, "images").compactMap { JS.str($0, "url") } }
        url = JS.str(o, "url")
        fetchedAt = JS.str(o, "fetchedAt")
        removed = JS.bool(o, "removed") ?? false
    }
}

/// Annonsen, e-postene og meldingene for én handel. 404 fra de nye endepunktene gir dataene i GET /finn/:id.
@MainActor
@Observable
final class FinnAd23Model {
    static let shared = FinnAd23Model()
    var openId: Int? = nil
    var ad: FinnAdData23? = nil
    var detail: FinnDetail? = nil
    var mails: [FinnAdMail23] = []
    var msgs: [FinnAdMsg23] = []
    var chatUrl: String? = nil
    var bodies: [String: String] = [:]
    var openMail: String? = nil
    var loading: Bool = false
    var slide: Int = 0
    var images: [String: UIImage] = [:]

    func open(_ id: Int, _ store: Store) {
        Haptics.shared.tap()
        openId = id
        ad = nil
        detail = nil
        mails = []
        msgs = []
        chatUrl = nil
        openMail = nil
        slide = 0
        Task { await load(id, store) }
    }

    func close() {
        Haptic34.back()
        openId = nil
    }

    private func get(_ store: Store, _ path: String) async -> Any? {
        guard let d = try? await store.api.call("GET", path) else { return nil }
        return try? JSONSerialization.jsonObject(with: d)
    }

    func load(_ id: Int, _ store: Store) async {
        loading = true
        defer { loading = false }
        let raw: Data? = try? await store.api.call("GET", "/finn/\(id)")
        if openId != id { return }
        let det: FinnDetail? = raw.flatMap { try? JSONDecoder().decode(FinnDetail.self, from: $0) }
        detail = det
        // GET /finn/:id har også messages og chatUrl.
        if let raw {
            let o: [String: Any] = JS.obj(raw)
            let m: [FinnAdMsg23] = FinnAd23Model.parseMsgs(o["messages"])
            if !m.isEmpty { msgs = m }
            if let c = JS.str(o, "chatUrl") { chatUrl = c }
        }
        if openId != id { return }
        if let o = await get(store, "/finn/\(id)/ad") as? [String: Any], JS.str(o, "error") == nil {
            if openId != id { return }
            ad = FinnAdData23(o)
            if let c = JS.str(o, "chatUrl") { chatUrl = c }
            let m: [FinnAdMsg23] = FinnAd23Model.parseMsgs(o["messages"])
            if !m.isEmpty { msgs = m }
        }
        let em: Any? = await get(store, "/finn/\(id)/emails")
        if openId != id { return }
        var list: [[String: Any]] = (em as? [Any])?.compactMap { $0 as? [String: Any] } ?? []
        if list.isEmpty, let o = em as? [String: Any] { list = JS.list(o, "emails") }
        if !list.isEmpty {
            mails = list.map { FinnAdMail23($0) }
        } else if let det {
            mails = det.emails.map { FinnAdMail23($0) }
        }
        mails.sort { $0.date < $1.date }
        let ms: Any? = await get(store, "/finn/\(id)/messages")
        if openId != id { return }
        if let o = ms as? [String: Any] {
            let m: [FinnAdMsg23] = FinnAd23Model.parseMsgs(o["items"] ?? o["messages"])
            if !m.isEmpty { msgs = m }
            if let c = JS.str(o, "chatUrl") { chatUrl = c }
        } else {
            let m: [FinnAdMsg23] = FinnAd23Model.parseMsgs(ms)
            if !m.isEmpty { msgs = m }
        }
    }

    static func parseMsgs(_ v: Any?) -> [FinnAdMsg23] {
        var arr: [[String: Any]] = (v as? [Any])?.compactMap { $0 as? [String: Any] } ?? []
        if arr.isEmpty, let o = v as? [String: Any] { arr = JS.list(o, "items") }
        return arr.compactMap { m -> FinnAdMsg23? in
            guard let t = JS.str(m, "text"), !t.isEmpty else { return nil }
            let who: String = JS.str(m, "from") ?? "them"
            return FinnAdMsg23(mine: who == "me", text: t, time: FinnAd23Model.time(JS.str(m, "time") ?? ""))
        }
    }

    /// «01.10 18:12» fra ISO-tid; dato alene blir «01.10».
    static func time(_ s: String) -> String {
        if s.isEmpty { return "" }
        if s.count == 10 { return ddmm(s) }
        if let d = JS.date(s) { return JS.fmt(d, "dd.MM HH:mm") }
        return s
    }

    func toggleMail(_ m: FinnAdMail23, _ store: Store) {
        Haptics.shared.select()
        if openMail == m.id { openMail = nil; return }
        openMail = m.id
        guard bodies[m.id] == nil, let id = openId else { return }
        if let b = m.body, !b.isEmpty { bodies[m.id] = b; return }
        let eid: String = m.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? m.id
        Task {
            guard let d = try? await store.api.call("GET", "/finn/\(id)/emails/\(eid)") else { return }
            let o: [String: Any] = JS.obj(d)
            let text: String? = JS.str(o, "body") ?? JS.str(o, "text") ?? String(data: d, encoding: .utf8).flatMap { $0.hasPrefix("{") ? nil : $0 }
            if let text, !text.isEmpty { bodies[m.id] = text }
        }
    }

    func refresh(_ store: Store) {
        guard let id = openId else { return }
        Haptics.shared.tap()
        Task {
            do {
                _ = try await store.api.call("POST", "/finn/\(id)/ad/refresh", json: [:])
                store.flash("✦ Annonsen er hentet på nytt")
            } catch let e as APIError where e.status == 404 {
                _ = try? await store.api.call("POST", "/finn/\(id)/ad", json: [:])
                store.flash("✦ Annonsen hentes")
            } catch {
                store.flash("Kunne ikke hente annonsen")
            }
            images = [:]
            await load(id, store)
        }
    }

    func image(_ path: String, _ store: Store) async -> UIImage? {
        if let i = images[path] { return i }
        let full: String = path.hasPrefix("/") ? path : "/" + path
        guard !path.hasPrefix("http") else { return nil }
        let img: UIImage? = await store.image(full)
        if let img { images[path] = img }
        return img
    }
}

/// Ett bilde i karusellen (fra serverens lokale kopi), eller fargeflate med initialer og «Bilde n».
struct FinnAdSlide23: View {
    @Environment(Store.self) private var store
    let path: String?
    let tint: Color
    let initials: String
    let label: String
    @State private var img: UIImage? = nil

    var body: some View {
        ZStack {
            tint
            if let img {
                Image(uiImage: img).resizable().scaledToFit()
            } else {
                VStack(spacing: 4) {
                    Text(initials).font(PF.ui(44, .bold)).foregroundStyle(Color.white.opacity(0.4))
                    Text(label).font(PF.ui(12, .semibold)).foregroundStyle(Color.white.opacity(0.4))
                }
            }
        }
        .task(id: path ?? "") {
            guard let path, !path.isEmpty else { img = nil; return }
            img = await FinnAd23Model.shared.image(path, store)
        }
    }
}

/// Annonsen i full skjerm: karusell (sveip, prikker og «1 / 4»), «‹ Finn» og ✎, status og dato, tittel, pris,
/// «Kjøpt fra/Solgt til», Fiks ferdig, «Om annonsen», beskrivelse, «Åpne annonsen i Finn ›», E-poster og Meldinger.
struct FinnAd23View: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let deal: FinnDeal
    let edit: () -> Void
    @State private var msg: String = ""
    @State private var drag: CGFloat = 0

    @MainActor private var m: FinnAd23Model { FinnAd23Model.shared }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                FinnAdCarousel23(deal: deal, images: images, close: { m.close() }, edit: edit)
                VStack(alignment: .leading, spacing: 18) {
                    FinnAdHead23(deal: deal, ad: m.ad ?? oldAd)
                    FinnAdSteps23(deal: deal)
                    FinnAdAbout23(deal: deal, ad: m.ad ?? oldAd, hasApi: m.ad != nil, refresh: { m.refresh(store) })
                    FinnAdMails23(mails: m.mails)
                    FinnAdChat23(deal: deal, msgs: m.msgs, link: chatLink, msg: $msg)
                }
                .padding(.horizontal, 16).padding(.top, 18).padding(.bottom, 40)
            }
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .ignoresSafeArea(edges: .top)
        .background(p.bg.ignoresSafeArea())
        .offset(x: drag)
        .simultaneousGesture(edgeBack)
        .environment(\.colorScheme, p.dark ? .dark : .light)
    }

    /// Sveip fra venstre kant lukker annonsen (karusellen tar ikke kanten).
    private var edgeBack: some Gesture {
        DragGesture(minimumDistance: 12)
            .onChanged { v in
                if v.startLocation.x < 24 && v.translation.width > 0 { drag = v.translation.width }
            }
            .onEnded { v in
                let w: CGFloat = UIScreen.main.bounds.width
                if v.startLocation.x < 24 && (v.translation.width > w * 0.5 || v.predictedEndTranslation.width > w * 0.9) {
                    withAnimation(.easeOut(duration: 0.18)) { drag = w }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) { m.close(); drag = 0 }
                } else {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { drag = 0 }
                }
            }
    }

    /// Den gamle annonsen i handelen (GET /finn/:id → ad) når /finn/:id/ad mangler (404).
    private var oldAd: FinnAdData23? {
        guard let a = m.detail?.ad else { return nil }
        var o: FinnAdData23 = FinnAdData23()
        o.title = a.title ?? ""
        o.price = a.price
        o.description = a.description ?? ""
        o.images = a.images
        o.url = a.url
        o.fetchedAt = a.saved
        if let place = a.place, !place.isEmpty { o.attrs = [FinnAdAttr23(label: "Lokasjon", value: place)] }
        return o
    }

    private var images: [String] {
        let a: [String] = (m.ad ?? oldAd)?.images ?? []
        if !a.isEmpty { return a }
        let det: [String] = m.detail?.images ?? []
        if !det.isEmpty { return det }
        if let i = deal.image, !i.isEmpty { return [i] }
        return []
    }

    private var chatLink: String? {
        if let c = m.chatUrl, !c.isEmpty { return c }
        if let u = (m.ad ?? oldAd)?.url, !u.isEmpty { return u }
        if let u = deal.adUrl, !u.isEmpty { return u }
        if let c = deal.code, !c.isEmpty, c.allSatisfy(\.isNumber) { return "https://www.finn.no/recommerce/forsale/item/\(c)" }
        return nil
    }
}

/// Bildekarusellen: kvadratisk (maks 62 % av høyden), sveip med prikker og «1 / 4», «‹ Finn» og ✎ øverst.
struct FinnAdCarousel23: View {
    let deal: FinnDeal
    let images: [String]
    let close: () -> Void
    let edit: () -> Void
    @State private var ix: Int = 0

    private static let tints: [String] = ["#3A2F4A", "#1E2A3F", "#3B2E22", "#22362C", "#2C2C33", "#2A3540"]

    var body: some View {
        let w: CGFloat = UIScreen.main.bounds.width
        let h: CGFloat = Swift.min(w, UIScreen.main.bounds.height * 0.62)
        let n: Int = Swift.max(1, slides.count)
        return ZStack {
            Color(hex: "#1b1a17")
            TabView(selection: $ix) {
                ForEach(Array(slides.enumerated()), id: \.offset) { i, path in
                    FinnAdSlide23(path: path, tint: tint(i), initials: initials, label: "Bilde \(i + 1)").tag(i)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            VStack {
                HStack {
                    Button(action: close) {
                        Text("‹ Finn").font(PF.ui(13.5, .semibold)).foregroundStyle(.white)
                            .padding(.leading, 10).padding(.trailing, 14).frame(height: 38)
                            .background(.ultraThinMaterial, in: Capsule())
                            .background(Color(hex: "#1b1a17").opacity(0.6), in: Capsule())
                    }
                    .buttonStyle(.plain)
                    Spacer()
                    Button(action: edit) {
                        Text("✎").font(.system(size: 14)).foregroundStyle(.white).frame(width: 38, height: 38)
                            .background(.ultraThinMaterial, in: Circle())
                            .background(Color(hex: "#1b1a17").opacity(0.6), in: Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Rediger")
                }
                .padding(.horizontal, 14).padding(.top, topInset + 6)
                Spacer()
                ZStack {
                    HStack(spacing: 6) {
                        ForEach(0..<n, id: \.self) { i in
                            Circle().fill(i == ix ? Color.white : Color.white.opacity(0.45)).frame(width: 7, height: 7)
                        }
                    }
                    HStack {
                        Spacer()
                        Text("\(ix + 1) / \(n)").font(PF.ui(11.5, .bold)).foregroundStyle(.white)
                            .padding(.horizontal, 9).padding(.vertical, 3)
                            .background(Color(hex: "#1b1a17").opacity(0.65), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    }
                    .padding(.trailing, 12)
                }
                .padding(.bottom, 10)
            }
        }
        .frame(width: w, height: h)
        .clipped()
        .onChange(of: ix) { _, _ in Haptics.shared.select() }
    }

    /// Tre plassholdere uten bilder (som i designet).
    private var slides: [String?] {
        if images.isEmpty { return [nil, nil, nil] }
        return images.map { Optional($0) }
    }

    private func tint(_ i: Int) -> Color {
        let t: [String] = FinnAdCarousel23.tints
        return Color(hex: t[((deal.id + i) % t.count + t.count) % t.count])
    }

    private var initials: String {
        let w: [String] = (deal.item ?? "").split(whereSeparator: \.isWhitespace).prefix(2).compactMap { $0.first.map { String($0).uppercased() } }
        let s: String = w.joined()
        return s.isEmpty ? "•" : s
    }

    private var topInset: CGFloat {
        let scene: UIWindowScene? = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        let inset: CGFloat = scene?.windows.first(where: { $0.isKeyWindow })?.safeAreaInsets.top ?? scene?.windows.first?.safeAreaInsets.top ?? 0
        return inset > 0 ? inset : 47
    }
}

/// Status og dato, tittel (Newsreader 28), pris (Newsreader 34) og «Kjøpt fra …» / «Solgt til …».
struct FinnAdHead23: View {
    @Environment(\.paper) private var p
    let deal: FinnDeal
    let ad: FinnAdData23?

    var body: some View {
        let who: String = (deal.counterpart ?? "").isEmpty ? "–" : (deal.counterpart ?? "")
        let date: String = ddmm(deal.date)
        let status: String = deal.finished ? "Fullført" : deal.status
        let title: String = (deal.item ?? "").isEmpty ? (ad?.title ?? "Finn-handel") : (deal.item ?? "")
        let price: Double = deal.amount ?? ad?.price ?? 0
        return VStack(alignment: .leading, spacing: 6) {
            Text((status + (date.isEmpty ? "" : " · " + date)).uppercased()).font(PF.mono(10.5)).tracking(1.26)
                .foregroundStyle(deal.finished ? p.pos : p.lab)
            Text(title).font(PF.serif(28, medium: true)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
            Text("\(n0(price)) kr").font(PF.serif(34)).foregroundStyle(p.ink)
            Text((deal.sold ? "Solgt til " : "Kjøpt fra ") + who).font(PF.ui(13.5)).foregroundStyle(p.mut)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// FIKS FERDIG: fire steg med linje og navn.
struct FinnAdSteps23: View {
    @Environment(\.paper) private var p
    let deal: FinnDeal

    var body: some View {
        let st: Int = deal.level - 1
        let done: Bool = deal.finished
        return VStack(alignment: .leading, spacing: 8) {
            Text("FIKS FERDIG").font(PF.mono(10.5)).tracking(1.26).foregroundStyle(p.lab)
            HStack(alignment: .top, spacing: 6) {
                ForEach(Array(deal.points.enumerated()), id: \.offset) { j, n in
                    VStack(alignment: .leading, spacing: 6) {
                        Capsule().fill(color(j, st, done)).frame(height: 4)
                        Text(n).font(PF.ui(11.5, .semibold)).foregroundStyle(j <= st ? p.ink : p.mut).lineLimit(1).minimumScaleFactor(0.8)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func color(_ j: Int, _ st: Int, _ done: Bool) -> Color {
        if done { return p.pos }
        if j < st { return p.ink }
        if j == st { return p.lab }
        return p.line
    }
}

/// OM ANNONSEN: attributter (tilstand, merke, modell …), beskrivelse og «Åpne annonsen i Finn ›».
struct FinnAdAbout23: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let deal: FinnDeal
    let ad: FinnAdData23?
    let hasApi: Bool
    let refresh: () -> Void

    var body: some View {
        let attrs: [FinnAdAttr23] = ad?.attrs ?? []
        let desc: String = ad?.description ?? ""
        let url: String? = ad?.url ?? deal.adUrl
        return VStack(alignment: .leading, spacing: 8) {
            Text("OM ANNONSEN").font(PF.mono(10.5)).tracking(1.26).foregroundStyle(p.lab)
            if !attrs.isEmpty {
                VStack(spacing: 0) {
                    ForEach(Array(attrs.enumerated()), id: \.offset) { i, r in
                        if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                        HStack(alignment: .firstTextBaseline, spacing: 12) {
                            Text(r.label).font(PF.ui(14)).foregroundStyle(p.mut)
                            Spacer(minLength: 6)
                            Text(r.value).font(PF.ui(14, .semibold)).foregroundStyle(p.ink).multilineTextAlignment(.trailing)
                        }
                        .padding(.vertical, 11)
                    }
                }
                .padding(.horizontal, 14).padding(.vertical, 2)
                .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            if !desc.isEmpty {
                Text(desc).font(PF.ui(15)).foregroundStyle(p.ink).lineSpacing(5).fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 2).padding(.top, 4)
            }
            if ad == nil {
                Text("Annonsen er ikke hentet ennå.").font(PF.ui(13.5)).foregroundStyle(p.mut)
            } else if ad?.removed == true {
                Text("Annonsen er fjernet fra Finn. Dette er den lagrede kopien.").font(PF.ui(12.5)).foregroundStyle(p.mut)
            }
            HStack(spacing: 16) {
                if let url, !url.isEmpty {
                    Button { store.openLink(url) } label: {
                        Text("Åpne annonsen i Finn ›").font(PF.ui(13.5, .bold)).foregroundStyle(p.lab).underline()
                    }
                    .buttonStyle(.plain)
                }
                if url != nil && (ad == nil || hasApi) {
                    Button(action: refresh) {
                        Text("↻ Hent på nytt").font(PF.ui(12.5, .semibold)).foregroundStyle(p.mut)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// E-POSTER · N (Proton Mail): avsender med farge, emne, tid og avsender; trykk for å lese.
struct FinnAdMails23: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let mails: [FinnAdMail23]

    @MainActor private var m: FinnAd23Model { FinnAd23Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text("E-POSTER · \(mails.count)").font(PF.mono(10.5)).tracking(1.26).foregroundStyle(p.lab)
                Spacer()
                Text("Proton Mail").font(PF.ui(12)).foregroundStyle(p.mut)
            }
            VStack(spacing: 0) {
                if mails.isEmpty {
                    Text("Ingen e-poster er koblet til handelen ennå.").font(PF.ui(13.5)).foregroundStyle(p.mut)
                        .padding(.vertical, 12).frame(maxWidth: .infinity, alignment: .leading)
                }
                ForEach(Array(mails.enumerated()), id: \.element.id) { i, e in
                    if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                    row(e)
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 2)
            .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
    }

    private func row(_ e: FinnAdMail23) -> some View {
        let open: Bool = m.openMail == e.id
        let text: String = m.bodies[e.id] ?? (e.body ?? e.snippet)
        return Button { m.toggleMail(e, store) } label: {
            HStack(alignment: .top, spacing: 12) {
                Text(FinnAdMails23.initial(e.from)).font(PF.ui(13, .heavy)).foregroundStyle(.white)
                    .frame(width: 34, height: 34)
                    .background(FinnAdMails23.color(e.from, p), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(e.subject).font(PF.ui(14, .bold)).foregroundStyle(p.ink).lineLimit(1)
                        Spacer(minLength: 4)
                        Text(FinnAd23Model.time(e.date)).font(PF.ui(11.5)).foregroundStyle(p.mut).lineLimit(1)
                    }
                    Text(FinnAdMails23.sender(e.from)).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(1)
                    if open && !text.isEmpty {
                        Text(text).font(PF.ui(14)).foregroundStyle(p.ink).lineSpacing(4).fixedSize(horizontal: false, vertical: true)
                            .multilineTextAlignment(.leading).padding(.top, 6)
                    }
                }
            }
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    static func sender(_ from: String) -> String {
        let f: String = from.lowercased()
        if f.contains("finn") { return "FINN" }
        if f.contains("posten") { return "Posten" }
        if f.contains("bring") { return "Bring" }
        var s: String = from
        if let r = s.range(of: "<") { s = String(s[..<r.lowerBound]) }
        s = s.replacingOccurrences(of: "\"", with: "").trimmingCharacters(in: .whitespaces)
        return s.isEmpty ? from : s
    }

    static func initial(_ from: String) -> String {
        let s: String = sender(from)
        return String(s.prefix(1)).uppercased()
    }

    static func color(_ from: String, _ p: PaperPalette) -> Color {
        let f: String = from.lowercased()
        if f.contains("finn") { return Color(hex: "#0063fb") }
        if f.contains("posten") || f.contains("bring") { return Color(hex: "#e32d22") }
        return p.ink
    }
}

/// MELDINGER · motparten: bobler (mine til høyre i blekk) og et felt som sender deg til samtalen i Finn.
struct FinnAdChat23: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let deal: FinnDeal
    let msgs: [FinnAdMsg23]
    let link: String?
    @Binding var msg: String

    var body: some View {
        let other: String = (deal.counterpart ?? "").isEmpty ? (deal.sold ? "kjøperen" : "selgeren") : (deal.counterpart ?? "")
        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text("MELDINGER · \(other)".uppercased()).font(PF.mono(10.5)).tracking(1.26).foregroundStyle(p.lab).lineLimit(1)
                Spacer()
                if let link {
                    Button { store.openLink(link) } label: { Text("Åpne i Finn ›").font(PF.ui(12)).foregroundStyle(p.mut) }.buttonStyle(.plain)
                }
            }
            VStack(alignment: .leading, spacing: 6) {
                if msgs.isEmpty {
                    Text("Ingen meldinger ennå. De hentes fra e-postvarslene fra Finn («Du har fått en ny melding»).")
                        .font(PF.ui(13.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                }
                ForEach(Array(msgs.enumerated()), id: \.offset) { _, c in bubble(c) }
                input.padding(.top, 6)
            }
            .padding(14)
            .background(p.bg, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(p.line, lineWidth: 1))
        }
    }

    private func bubble(_ c: FinnAdMsg23) -> some View {
        let shape: UnevenRoundedRectangle = c.mine
            ? UnevenRoundedRectangle(topLeadingRadius: 18, bottomLeadingRadius: 18, bottomTrailingRadius: 6, topTrailingRadius: 18, style: .continuous)
            : UnevenRoundedRectangle(topLeadingRadius: 18, bottomLeadingRadius: 6, bottomTrailingRadius: 18, topTrailingRadius: 18, style: .continuous)
        return VStack(alignment: c.mine ? .trailing : .leading, spacing: 2) {
            Text(c.text).font(PF.ui(14.5)).foregroundStyle(c.mine ? p.bg : p.ink).lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 13).padding(.vertical, 9)
                .background(c.mine ? p.ink : p.card, in: shape)
                .frame(maxWidth: UIScreen.main.bounds.width * 0.66, alignment: c.mine ? .trailing : .leading)
            if !c.time.isEmpty {
                Text(c.time).font(PF.ui(10.5)).foregroundStyle(p.mut).padding(.horizontal, 6)
            }
        }
        .frame(maxWidth: .infinity, alignment: c.mine ? .trailing : .leading)
    }

    private var input: some View {
        HStack(spacing: 8) {
            TextField("", text: $msg, prompt: Text("Skriv en melding …").foregroundColor(p.mut))
                .font(PF.ui(14.5, .medium)).foregroundStyle(p.ink)
                .submitLabel(.send).onSubmit(send)
                .padding(.horizontal, 14).frame(height: 44)
                .background(p.card, in: Capsule())
                .overlay(Capsule().stroke(p.line, lineWidth: 1))
            Button(action: send) {
                Text("↑").font(.system(size: 16, weight: .semibold)).foregroundStyle(p.bg).frame(width: 44, height: 44).background(p.ink, in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Send")
        }
    }

    /// Finn har ikke åpent chat-API: teksten kopieres, og samtalen åpnes i Finn (dyplenke) så du kan lime den inn.
    private func send() {
        let t: String = msg.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let link else { store.flash("Handelen har ingen lenke til Finn ennå"); return }
        if !t.isEmpty { UIPasteboard.general.string = t }
        msg = ""
        store.flash(t.isEmpty ? "Åpner samtalen i Finn" : "Meldingen er kopiert. Lim den inn i Finn.")
        store.openLink(link)
    }
}
