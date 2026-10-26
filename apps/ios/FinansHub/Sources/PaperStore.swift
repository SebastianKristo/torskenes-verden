import Foundation
import SwiftUI
import UIKit

/* ---------------- Papir, nyhetsleser, fotovindu og Mat: data (prompt 13) ---------------- */

extension Store {
    /* ---------- Oppsett per bruker (/api/me/layout) ---------- */

    /// paperMode og photo fra serveren. Lokalt valg brukes til serveren har svart.
    /// Prompt 42: mobileDesign = «klassisk» fra serveren flyttes til Papir (Design42.swift).
    func applyPaperLayout(_ o: [String: Any]) {
        if JS.str(o, "mobileDesign") == "klassisk" { migrateClassic42(server: true) }
        // Prompt 50: Liquid Glass er et lokalt valg (serveren kjenner bare auto/lys/mork) og overskrives ikke herfra.
        // Prompt 51 (IOSFEAT51): når temaet er synket via /api/me/theme51 (Theme51.swift), er det den som gjelder (også «auto51-…»).
        if let v = JS.str(o, "paperMode"), ["auto", "lys", "mork"].contains(v), v != paperMode, paperMode != Glass50.mode,
           !paperMode.hasPrefix(Theme51.autoPrefix), Theme51.shared.updatedAt <= 0 { paperMode = v }
        // Prompt 46: Google Photos-albumet synkes som bgType 'gphoto' (layout.photo godtar ikke verdien) og vinner over photo.
        let bg46: String? = JS.str(o, "bgType") == "gphoto" ? "gphoto" : JS.str(o, "photo")
        if let v = bg46, ["cur", "oslo", "weather", "planets", "custom", "gphoto"].contains(v), v != photo {
            photo = v
            Task { await self.loadPhotoWindow() }
        }
        // Rekkefølgen på Sporing-kortene og onboarding (nye brukere får onboarded: false).
        let order = JS.strings(o, "trkOrder").filter { Store.trkKeys.contains($0) }
        if !order.isEmpty { trkOrder = Store.fullTrkOrder(order) }
        if JS.bool(o, "onboarded") == false, !UserDefaults.standard.bool(forKey: "fh_onboarded"), onboarding == nil { onboarding = 0 }
        applyPaper15(o)
        applyPaper16(o)
        applyPaper19(o)
        applyPaper22(o)
        NavHome42.shared.apply(o)
        FinTileOrder20.apply(o)
        FinHidden30.shared.apply(o)
        Prof24.shared.apply(o, self)
    }

    nonisolated static let trkKeys = ["add", "shipments", "notify", "carriers"]
    nonisolated static func fullTrkOrder(_ o: [String]) -> [String] {
        var out = o.filter { trkKeys.contains($0) }
        for k in trkKeys where !out.contains(k) { out.append(k) }
        return out
    }

    /// Flytter et Sporing-kort opp (-1) eller ned (+1) og lagrer rekkefølgen per bruker.
    func moveTrkCard(_ k: String, _ dir: Int) {
        var o = Store.fullTrkOrder(trkOrder)
        guard let i = o.firstIndex(of: k) else { return }
        let j = i + dir
        guard j >= 0, j < o.count else { return }
        o.swapAt(i, j)
        Haptics.shared.tick()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { trkOrder = o }
        savePaperLayout(["trkOrder": o])
    }

    func setTrkOrder(_ o: [String]) {
        trkOrder = Store.fullTrkOrder(o)
        savePaperLayout(["trkOrder": trkOrder])
    }

    /// Onboarding ferdig (eller hoppet over): lagres lokalt og per bruker.
    func finishOnboarding() {
        onboarding = nil
        UserDefaults.standard.set(true, forKey: "fh_onboarded")
        savePaperLayout(["onboarded": true])
    }

    func savePaperLayout(_ body: [String: Any]) {
        // Prompt 70: pages.hjem.sz (halv/full per widget) følger med når pages.hjem lagres (Home70Grid.swift).
        let b70: [String: Any] = Home70Size.shared.inject(body)
        Task { _ = try? await self.api.callAt("/api", "PUT", "/me/layout", json: b70) }
    }

    func setPaperMode(_ v: String) {
        paperMode = v
        // Prompt 50: Glass lagres bare lokalt (layout.paperMode godtar ikke verdien).
        if v != Glass50.mode { savePaperLayout(["paperMode": v]) }
        // Prompt 51 (IOSFEAT51): temaet følger kontoen til de andre enhetene (/api/me/theme51, Theme51.swift).
        if v != Glass50.mode {
            Theme51.shared.mode = v == "lys" ? "light" : (v == "mork" ? "dark" : "system")
            Task { await Theme51.shared.push(v, self) }
        }
        Haptics.shared.select()
    }

    func setPhoto(_ v: String) {
        // Prompt 46: fra Google Photos-albumet (synket som bgType) tilbake til et vanlig valg – bgType følger med.
        let wasAlbum: Bool = photo == "gphoto"
        photo = v
        var body46: [String: Any] = ["photo": v]
        if wasAlbum && v != "gphoto" { body46["bgType"] = v }
        savePaperLayout(body46)
        Task { await self.loadPhotoWindow() }
    }

    /* ---------- Papir-navigasjon ---------- */

    /// Finans i Papir har egen fanelinje: Oversikt, Liste, Finn og Mer.
    nonisolated static let paperFinTabs = ["finans", "fliste", "finn", "fmer", "fsok", "ftx", "abo", "aksjer", "boliger", "kvitt"]
    /// Domener i Papir: Oversikt, Publikum, Ytelse og Infra.
    nonisolated static let paperDomTabs = ["domener", "dpub", "dytl", "dinf"]

    var paperInFinance: Bool {
        if Store.paperFinTabs.contains(paperTab) { return true }
        if paperFin != nil { return true }
        if let m = paperClassic, m.isFinance || m == .upload { return true }
        return false
    }
    var paperInDomains: Bool { Store.paperDomTabs.contains(paperTab) }

    /// Bytter Papir-fane. Data lastes som i den klassiske appen.
    func paperGo(_ t: String) {
        if paperTapBlocked { return }
        // Prompt 32: den gamle oppdateringssiden finnes ikke lenger; lenker dit åpner Nordlys OS (System31.swift).
        if t == "innst-oppdatering" { System31Model.shared.show(); return }
        // Prompt 46: Kart (Mer → Kart, Glimt «vis bussene rundt hjemme» → tkart / tkart:<sone>) i fullskjerm.
        if t == "tkart" || t.hasPrefix("tkart:") { Kart46.shared.show(self, zone: t.hasPrefix("tkart:") ? String(t.dropFirst(6)) : nil); return }
        // Prompt 33: kalenderfanen, Mer → Kalender, varsler og Glimt åpner Kalender-appen når den er installert (KalLink33.swift).
        if t == "kalender" && paperTab != "kalender" && KalLink33.today() { return }
        // Prompt 34: en tilbake-handling har allerede gitt én lett impuls (Haptic34) – ikke et valg-tikk i tillegg.
        if !Haptic34.recent { Haptics.shared.select() }
        // Prompt 38: husk hvor Abonnement ble åpnet fra, så ‹ går tilbake dit (Nav38.swift).
        abo38Note(t)
        // Mellom Domener-fanene byttes bare seksjonen (dataene er de samme).
        if paperInDomains && Store.paperDomTabs.contains(t) && module == .domains {
            paperTab = t
            domTab = t == "dpub" ? .visits : t == "dytl" ? .perf : t == "dinf" ? .security : .traffic
            return
        }
        paperFin = nil
        paperTrackFull = false
        paperBgOpen = false
        newsOpen = false
        selectedTx = nil
        detail = nil
        editing = nil
        original = nil
        finnSel = nil
        finnDetail = nil
        trkSettings = false
        paperEditPage = nil
        switch t {
        case "finans": go(.home)
        case "fsok": go(.search)
        case "ftx": break
        case "abo": Task { try? await self.loadSubs() }
        case "fliste": go(.list)
        case "finn": go(.finn)
        case "aksjer": Task { await self.loadStocksQuiet() }
        // Prompt 23: Kvitteringer i Papir (Receipts23.swift) laster selv.
        case "kvitt": break
        case "boliger": Task { await self.loadBoligerList() }
        case "familie":
            // Prompt 50: Familie åpnes på roten (Folk) når du kommer fra en annen side (Family50Model.swift).
            if paperTab != "familie" { Fam50Nav.shared.reset() }
            Task { await FamilyModel.shared.load(self) }
        case "avg": Task { await RuterModel.shared.load(self) }
        case "huske": Task { await TasksModel.shared.load(self) }
        case "mat": open(.mat)
        case "sporing": open(.tracking)
        case "domener", "dpub", "dytl", "dinf":
            open(.domains)
            domTab = t == "dpub" ? .visits : t == "dytl" ? .perf : t == "dinf" ? .security : .traffic
        default: open(.homelab)
        }
        // open/go over setter module; Papir-fanen styrer selve visningen.
        // Prompt 27: husk hvor Kalender og Chat ble åpnet fra (‹ går tilbake dit, Calendar27Model.swift).
        Nav27.note(from: paperTab, to: t)
        paperTab = t
        if Store.paperFinTabs.contains(t) || t == "mer" || t == "innst" || t == "hjem" { module = t == "hjem" || t == "mer" || t == "innst" ? .homelab : nil }
        if t != "ftx" { paperTxId = nil }
    }

    /// Pila øverst til venstre: i Finans og Domener tilbake til Hjem (Domener: dit brukeren kom fra).
    func paperUp() {
        Haptic34.back() // prompt 34: lett impuls på alle tilbake-knapper (Nav34.swift)
        // En Finans-side fra den klassiske appen (Liste med valgt rad, Budsjett …): rett tilbake til Papir-fanen.
        if paperFin != nil && original == nil && editing == nil && detail == nil {
            selectedTx = nil
            paperFin = nil
            return
        }
        if paperInner || paperFin != nil || (paperClassic != nil && !paperInDomains) { paperBack(); return }
        // Prompt 40: Gjøremål går alltid tilbake til Hjem (også åpnet fra Mer), historikken nullstilles.
        if paperTab == "huske" { paperGo("hjem"); return }
        // Domener går alltid hjem, også når siden ble åpnet fra Mer (prompt 24: Boliger i Finans + Boliger).
        if paperInDomains { prof24GoRoot(); return }
        if paperTab == "ftx" { paperGo("fliste"); return }
        if paperTab == "abo", let f = abo38From { paperGo(f); return }
        if paperTab == "abo" && !finNav.contains("abonnementer") { paperGo("fmer"); return }
        if paperTab == "innst" { paperGo("mer"); return }
        if let t = nav26BackTarget() { paperGo(t); return }
        if paperTab.hasPrefix("innst-") || paperTab == "profil" { paperGo("innst"); return }
        if paperTab == "kalender" || paperTab == "chat" { Nav27.back(self); return }
        if paperTab == "huske" || paperTab == "bursdag" || paperTab == "kalender" { paperGo("mer"); return }
        if paperTab == "boliger" && folder != nil { folder = nil; return }
        if (paperTab == "aksjer" && !finNav.contains("aksjer")) || (paperTab == "boliger" && !finNav.contains("boliger")) { paperGo("fmer"); return }
        if paperTab == "kvitt" && !finNav.contains("kvitteringer") { paperGo("fmer"); return }
        prof24GoRoot()
    }

    /// Hvor Domener ble åpnet fra (Hjem eller Mer).
    var paperDomFrom: String { UserDefaults.standard.string(forKey: "fh_dom_from") ?? "hjem" }
    func paperOpenDomains(from: String) {
        UserDefaults.standard.set(from, forKey: "fh_dom_from")
        paperGo("domener")
    }

    /// En Finans-fane fra den klassiske appen (Liste, Budsjett, Søk, Finn).
    func paperOpenFin(_ t: Tab) {
        if paperTapBlocked { return }
        go(t)
        paperFin = t
    }

    /// En hel side fra den klassiske appen (Domener, Aksjer, Abonnementer, Boliger, Innstillinger …).
    func paperOpen(_ m: Module) {
        if paperTapBlocked { return }
        // Prompt 23: Kvitteringer og Aksjer er Papir-sider med toppbilde (ikke sidene fra den klassiske appen).
        if m == .upload { paperGo("kvitt"); return }
        if m == .stocks { paperGo("aksjer"); return }
        paperFin = nil
        openSub(m)
    }

    /// Det som er åpent inne på en side (detalj, skjema, valgt rad) lukkes først av den vanlige tilbakefunksjonen.
    var paperInner: Bool {
        if original != nil || editing != nil || detail != nil { return true }
        if module == .settings, settingsPage != nil { return true }
        if module == .folders, folder != nil { return true }
        if module == .tracking, trkSel != nil { return true }
        if module == .stocks, stockScreen != "ov" { return true }
        if module == .upload, selectedReceipt != nil { return true }
        return finnSel != nil || selectedTx != nil
    }

    /// Tilbake i Papir: lukker det som er åpent, ellers tilbake til fanen.
    func paperBack() {
        Haptic34.back()
        if paperEditPage != nil { paperEditPage = nil; return }
        if newsOpen { newsOpen = false; return }
        if dishSel != nil { dishSel = nil; return }
        if paperInner { back(); return }
        if paperInDomains { prof24GoRoot(); return }
        if paperTab == "ftx" { paperGo("fliste"); return }
        if paperTab == "abo", let f = abo38From { paperGo(f); return }
        if paperTab == "abo" && !finNav.contains("abonnementer") { paperGo("fmer"); return }
        if paperTab == "boliger" && folder != nil { folder = nil; return }
        if let t = nav26BackTarget() { paperGo(t); return }
        if paperTab.hasPrefix("innst-") || paperTab == "profil" { paperGo("innst"); return }
        if paperTab == "kalender" || paperTab == "chat" { Nav27.back(self); return }
        // Prompt 40: sveip fra venstre kant i Gjøremål går også til Hjem.
        if paperTab == "huske" && paperClassic == nil && paperFin == nil { paperGo("hjem"); return }
        if paperTab == "huske" || paperTab == "bursdag" || paperTab == "kalender" { paperGo("mer"); return }
        if nav23SubOfFinMore { paperGo("fmer"); return }
        if paperFin != nil { paperFin = nil; go(.home); return }
        if paperTrackFull { paperTrackFull = false; return }
        if paperClassic != nil { back(); return }
    }

    /// Den klassiske siden som vises i Papir (nil = Papir-sidene).
    var paperClassic: Module? {
        guard let m = module else { return nil }
        switch m {
        case .homelab, .mat: return nil
        case .tracking: return paperTrackFull ? .tracking : nil
        case .domains: return paperInDomains ? nil : m
        default: return m
        }
    }

    var paperCanSwipeBack: Bool {
        newsOpen || dishSel != nil || paperInner || paperFin != nil || paperTrackFull || paperClassic != nil || paperInDomains
            || paperTab == "ftx" || paperEditPage != nil || (paperTab == "abo" && (!finNav.contains("abonnementer") || abo38From != nil))
            || paperTab.hasPrefix("innst-") || paperTab == "profil" || paperTab == "huske" || paperTab == "kalender" || (paperTab == "boliger" && folder != nil)
            || nav23SubOfFinMore
            // Prompt 30: Chat (fullskjerm) og Bursdager fra Mer kan også sveipes tilbake.
            || paperTab == "chat" || (paperTab == "bursdag" && !mainTabItems.contains(where: { $0.id == "bursdag" }))
    }

    /// Oversikt og kontoer til Papir-Finans (uten feilmelding når serveren ikke svarer).
    func loadPaperFinance(force: Bool = false) async {
        if force || summary == nil { if let s = try? await api.get("/summary", as: Summary.self) { summary = s } }
        if force || boot == nil { if let b = try? await api.get("/bootstrap", as: Boot.self) { boot = b } }
    }

    /* ---------- Forsiden: nyheter og vær ---------- */

    /// news (5 saker) og værets koordinater fra /api/mobile/home.
    func applyPaperHome(_ raw: [String: Any]) {
        let n = JS.list(raw, "news").map(NewsItem.init)
        if !n.isEmpty || raw["news"] != nil { homeNews = Array(n.prefix(5)) }
        let w = JS.dict(raw, "weather")
        weatherLat = JS.num(w, "lat") ?? JS.num(w, "latitude")
        weatherLon = JS.num(w, "lon") ?? JS.num(w, "lng") ?? JS.num(w, "longitude")
    }

    /// Yr for stedet: koordinater når serveren gir dem, ellers søk på stedsnavnet.
    var yrURL: URL? {
        if let la = weatherLat, let lo = weatherLon {
            return URL(string: String(format: "https://www.yr.no/nb/v%%C3%%A6rvarsel/daglig-tabell/%.4f,%.4f", la, lo))
        }
        let place = homeWeather?.place ?? mobileHome?.weather?.place ?? "Oslo"
        let q = place.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "Oslo"
        return URL(string: "https://www.yr.no/nb/s%C3%B8k?q=\(q)")
    }

    /// Ruter-appen (universal link), med avreisestoppet når det finnes.
    func ruterURL(_ from: String) -> URL? {
        let f = from.trimmingCharacters(in: .whitespaces)
        if f.isEmpty { return URL(string: "https://reise.ruter.no/") }
        let q = f.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? f
        return URL(string: "https://ruter.no/reise/?from=\(q)")
    }

    /// Åpner en lenke som universal link: NRK-, VG-, E24-, Ruter- eller Yr-appen hvis den finnes, ellers nettleseren.
    func openLink(_ raw: String) {
        guard let u = URL(string: raw), u.scheme != nil else { return }
        openURL(u)
    }

    func openURL(_ u: URL?) {
        if paperTapBlocked { return }
        guard let u else { return }
        Haptics.shared.tap()
        UIApplication.shared.open(u, options: [:], completionHandler: nil)
    }

    /* ---------- Fotovindu ---------- */

    /// Bakgrunnen på Hjem: serveren laster ned og cacher bildene (/api/bg/…), appen cacher dem også på disk.
    /// Feiler et bilde, prøves neste i settet; feiler alle, vises gradienten og en feilmelding i menyen.
    func loadPhotoWindow() async {
        let kind = photo
        photoFailed = false
        if kind == "cur" { photoWindow = nil; photoImage = nil; bgInfo = nil; return }
        // Bildet fra forrige gang vises med en gang.
        if let cached = Store.cachedBg(kind) { photoImage = cached }
        // Prompt 41: Oslo = frie Commons-bilder fra lufta som skifter gjennom dagen (Bg41Oslo.swift), med mindre serveren har egne.
        if kind == "oslo", await Oslo41.shared.load(self) { return }
        // Prompt 52: «Vær nå» velger bilde etter værtype × tid på døgnet (Wx52Bg.swift).
        if kind == "weather", await Wx52Bg.shared.load(self) { return }
        // Prompt 46: delt Google Photos-album (serveren henter og cacher, GPhoto46.swift).
        if kind == "gphoto" { if !(await GPhoto46.shared.load(self)) { photoFailed = true }; return }
        // Ny bakgrunnstjeneste (prompt 19). Eldre servere: /api/photo-window under.
        if await loadBackground(kind) { return }
        guard let d = try? await api.callAt("/api", "GET", "/photo-window?kind=\(kind)") else {
            if photoImage == nil { photoFailed = true }
            return
        }
        let o = JS.obj(d)
        let pw = PhotoWindow(o, kind: kind)
        photoWindow = pw
        var urls: [String] = []
        if pw.hasBitmap { urls.append(pw.url) }
        for f in JS.strings(o, "fallbacks") where !f.isEmpty && !urls.contains(f) { urls.append(f) }
        if urls.isEmpty { photoImage = nil; return }
        for u in urls {
            if let img = await loadBg(u) {
                photoImage = img
                Store.storeBg(kind, img)
                return
            }
        }
        print("[Papir] Fikk ikke lastet bakgrunnsbildet (\(kind)): \(urls.joined(separator: ", "))")
        if photoImage == nil { photoFailed = true }
    }

    func loadBg(_ u: String) async -> UIImage? {
        if u.hasPrefix("http://") || u.hasPrefix("https://") {
            guard let url = URL(string: u), let r = try? await URLSession.shared.data(from: url) else { return nil }
            return UIImage(data: r.0)
        }
        return await image(u.hasPrefix("/") ? u : "/" + u)
    }

    nonisolated private static func bgFile(_ kind: String) -> URL? {
        guard let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else { return nil }
        return dir.appendingPathComponent("papir-bg-\(kind).jpg")
    }

    nonisolated static func cachedBg(_ kind: String) -> UIImage? {
        guard let f = bgFile(kind), let d = try? Data(contentsOf: f) else { return nil }
        return UIImage(data: d)
    }

    nonisolated static func storeBg(_ kind: String, _ img: UIImage) {
        guard let f = bgFile(kind), let d = img.jpegData(compressionQuality: 0.85) else { return }
        try? d.write(to: f)
    }

    func retryPhoto() {
        Task { await self.loadPhotoWindow() }
    }

    /// Eget bilde som bakgrunn (POST /api/me/photo-window).
    func uploadPhoto(_ img: UIImage) {
        guard let d = img.scaled(max: 2000).jpegData(compressionQuality: 0.85) else { return }
        run {
            _ = try await self.api.upload("/me/photo-window", parts: [API.Part(name: "file", filename: "bakgrunn.jpg", mime: "image/jpeg", data: d)], prefix: "/api")
            self.photo = "custom"
            self.savePaperLayout(["photo": "custom"])
            self.photoImage = img
            await self.loadPhotoWindow()
            self.flash("Bakgrunnen er lagret")
        }
    }

    func removePhoto() {
        run {
            _ = try? await self.api.callAt("/api", "DELETE", "/me/photo-window")
            self.setPhoto("oslo")
        }
    }

    /* ---------- Nyhetsleser (/api/rss) ---------- */

    func loadNews() async {
        newsBusy = true
        defer { newsBusy = false }
        // Prompt 46: «For deg» og egne kategorier som serveren ikke kjenner → Siste (80 saker) filtrert her (News46.swift).
        let local: Bool = News46.shared.isLocal(newsCat)
        let c0: String = local ? "siste" : newsCat
        let cat = c0.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? c0
        do {
            let d = try await api.callAt("/api", "GET", "/rss?cat=\(cat)&limit=\(local ? 80 : 40)")
            let raw46: [String: Any] = JS.obj(d)
            News46.shared.take(raw46)
            var n46: NewsData = NewsData(raw46)
            if News46.shared.isLocal(newsCat) { n46.items = News46.shared.filter(n46.items, newsCat) }
            news = n46
        } catch let e as APIError {
            if news == nil { news = NewsData() }
            message = e.status == 404 ? "Nyhetsleseren finnes ikke på serveren ennå. Oppdater homelab." : e.message
        } catch {
            if news == nil { news = NewsData() }
        }
    }

    func openNews() {
        if paperTapBlocked { return }
        newsOpen = true
        Task { await self.loadNews() }
    }

    func setNewsCat(_ c: String) {
        newsCat = c
        Haptics.shared.select()
        Task { await self.loadNews() }
    }

    func addFeed(_ url: String, category: String = "auto") {
        let u = url.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !u.isEmpty else { return }
        let full = u.hasPrefix("http") ? u : "https://" + u
        run {
            self.newsBusy = true
            defer { self.newsBusy = false }
            try await self.api.callAt("/api", "POST", "/rss/feeds", json: ["url": full, "category": category], timeout: 40)
            await self.loadNews()
            self.flash("Kilden er lagt til")
        }
    }

    func patchFeed(_ f: NewsFeed, _ body: [String: Any]) {
        run {
            try await self.api.callAt("/api", "PATCH", "/rss/feeds/\(f.id)", json: body)
            await self.loadNews()
        }
    }

    func deleteFeed(_ f: NewsFeed) {
        run {
            try await self.api.callAt("/api", "DELETE", "/rss/feeds/\(f.id)")
            await self.loadNews()
            self.flash("\(f.name) er fjernet")
        }
    }

    /// Bytter kategori for en kilde: Auto → Norge → Verden → … → Auto.
    func cycleFeedCategory(_ f: NewsFeed) {
        let ids = ["auto"] + (news?.categories ?? NewsData.standardCategories).map(\.id).filter { $0 != "siste" }
        let i = ids.firstIndex(of: f.category.lowercased()) ?? 0
        patchFeed(f, ["category": ids[(i + 1) % ids.count]])
    }

    func setNewsSetting(_ key: String, _ on: Bool) {
        if key == "aiSummary" { news?.aiSummary = on } else { news?.aiCategorize = on }
        run {
            try await self.api.callAt("/api", "PUT", "/rss/settings", json: [key: on])
            await self.loadNews()
        }
    }

    func refreshNews() {
        run {
            self.newsBusy = true
            defer { self.newsBusy = false }
            try await self.api.callAt("/api", "POST", "/rss/refresh", timeout: 60)
            await self.loadNews()
        }
    }

    /* ---------- Mat: mapper, oppskrifter, skanning og lenker (/mat/api) ---------- */

    func loadMatExtras() async {
        if let d = try? await api.raw("/mat/api", "/folders") {
            let obj = try? JSONSerialization.jsonObject(with: d)
            let arr = (obj as? [Any]) ?? ((obj as? [String: Any])?["items"] as? [Any]) ?? []
            matFolders = arr.compactMap { $0 as? [String: Any] }.map(MatFolder.init).sorted { $0.sort < $1.sort }
        }
        await loadRecipeJobs()
    }

    /// Alle retter (fra uka og oppskriftslisten), filtrert på valgt mappe.
    var matDishes: [Dish] {
        let all = week?.dishes ?? []
        guard let f = matFolder else { return all }
        return all.filter { $0.folderId == f }
    }

    func dish(_ id: String?) -> Dish? {
        guard let id else { return nil }
        return (week?.dishes ?? []).first { $0.id.value == id }
    }

    func folderName(_ id: String?) -> String {
        guard let id else { return "Ingen mappe" }
        return matFolders.first { $0.id == id }?.name ?? "Ingen mappe"
    }

    func addFolder(_ name: String) {
        let n = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !n.isEmpty else { return }
        run {
            try await self.api.matCall("POST", "/folders", json: ["name": n])
            await self.loadMatExtras()
            self.flash("Mappen \(n) er laget")
        }
    }

    func renameFolder(_ f: MatFolder, _ name: String) {
        let n = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !n.isEmpty else { return }
        run {
            try await self.api.matCall("PATCH", "/folders/\(f.id)", json: ["name": n])
            await self.loadMatExtras()
        }
    }

    func deleteFolder(_ f: MatFolder) {
        run {
            try await self.api.matCall("DELETE", "/folders/\(f.id)")
            if self.matFolder == f.id { self.matFolder = nil }
            await self.loadMatExtras()
            try await self.loadWeek()
            self.flash("Mappen er slettet. Rettene ligger nå uten mappe.")
        }
    }

    func moveDish(_ id: String, to folder: String?) {
        run {
            try await self.api.matCall("PATCH", "/dishes/\(id)", json: ["folderId": folder.map { $0 as Any } ?? NSNull()])
            try await self.loadWeek()
            await self.loadMatExtras()
            self.flash("Flyttet til \(self.folderName(folder))")
        }
    }

    /// Henter oppskriften fra en nettside og viser forhåndsvisningen.
    func importRecipe(_ url: String) {
        let u = url.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !u.isEmpty else { return }
        let full = u.hasPrefix("http") ? u : "https://" + u
        recipeBusy = true
        recipePreview = nil
        Task {
            defer { self.recipeBusy = false }
            do {
                let d = try await self.api.callAt("/mat/api", "POST", "/recipes/import", json: ["url": full], timeout: 60)
                self.recipePreview = RecipePreview(JS.obj(d))
            } catch {
                self.message = error.localizedDescription
                Haptics.shared.error()
            }
        }
    }

    func saveRecipe(folder: String?) {
        guard let p = recipePreview else { return }
        run {
            var body: [String: Any] = ["preview": p.raw]
            body["folderId"] = folder.map { $0 as Any } ?? NSNull()
            let d = try await self.api.callAt("/mat/api", "POST", "/recipes/import/save", json: body, timeout: 60)
            self.recipePreview = nil
            self.matImport = false
            try await self.loadWeek()
            await self.loadMatExtras()
            if let id = JS.str(JS.obj(d), "id") { self.dishSel = id }
            self.flash("\(p.name.isEmpty ? "Oppskriften" : p.name) er lagret")
        }
    }

    /// Skann oppskrift: bildet eller PDF-en legges i køen, og AI leser den i bakgrunnen.
    func scanRecipe(_ files: [Upload]) {
        guard !files.isEmpty else { return }
        flash(files.count == 1 ? "Oppskriften legges i køen ✦" : "\(files.count) oppskrifter legges i køen ✦")
        Task {
            for f in files {
                let part: API.Part
                switch f {
                case .image(let img):
                    guard let d = img.scaled(max: 2000).jpegData(compressionQuality: 0.85) else { continue }
                    part = API.Part(name: "file", filename: "oppskrift.jpg", mime: "image/jpeg", data: d)
                case .pdf(let d):
                    part = API.Part(name: "file", filename: "oppskrift.pdf", mime: "application/pdf", data: d)
                }
                do { _ = try await self.api.upload("/recipes/scan", parts: [part], prefix: "/mat/api") } catch { self.message = error.localizedDescription }
            }
            await self.loadRecipeJobs()
        }
    }

    func loadRecipeJobs() async {
        guard let d = try? await api.raw("/mat/api", "/recipes/jobs") else { return }
        let obj = try? JSONSerialization.jsonObject(with: d)
        let arr = (obj as? [Any]) ?? ((obj as? [String: Any])?["items"] as? [Any]) ?? []
        let jobs = arr.compactMap { $0 as? [String: Any] }.map(RecipeJob.init)
        let wasActive = recipeJobs.contains { $0.active }
        recipeJobs = jobs
        if jobs.contains(where: { $0.active }) {
            Task {
                try? await Task.sleep(for: .seconds(3))
                await self.loadRecipeJobs()
            }
        } else if wasActive {
            try? await loadWeek()
            await loadMatExtras()
        }
    }

    func retryRecipeJob(_ j: RecipeJob) {
        run {
            try await self.api.matCall("POST", "/recipes/jobs/\(j.id)/retry")
            await self.loadRecipeJobs()
        }
    }

    func deleteRecipeJob(_ j: RecipeJob) {
        run {
            try await self.api.matCall("DELETE", "/recipes/jobs/\(j.id)")
            await self.loadRecipeJobs()
        }
    }

    func addDishLink(_ id: String, title: String, url: String) {
        let u = url.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !u.isEmpty else { return }
        let full = u.hasPrefix("http") ? u : "https://" + u
        run {
            try await self.api.matCall("POST", "/dishes/\(id)/links", json: ["title": title, "url": full])
            try await self.loadWeek()
            self.flash("Lenken er lagt til")
        }
    }

    func addDishFile(_ id: String, name: String, data: Data, mime: String) {
        run {
            let parts = [API.Part(name: "file", filename: name, mime: mime, data: data), .text("title", name)]
            _ = try await self.api.upload("/dishes/\(id)/links", parts: parts, prefix: "/mat/api")
            try await self.loadWeek()
            self.flash("\(name) er lagt til")
        }
    }

    func deleteDishLink(_ id: String, _ link: DishLink) {
        run {
            try await self.api.matCall("DELETE", "/dishes/\(id)/links/\(link.id)")
            try await self.loadWeek()
        }
    }

    /// Lenken åpnes direkte. En fil åpnes fra serveren i nettleseren (med innloggingen i appen kreves token, så filen lastes ned først).
    func openDishLink(_ link: DishLink) {
        if !link.url.isEmpty { openLink(link.url); return }
        guard !link.fileUrl.isEmpty else { return }
        let path = link.fileUrl.hasPrefix("/") ? link.fileUrl : "/" + link.fileUrl
        run {
            let d = try await self.api.bytes(path)
            let name = link.title.isEmpty ? "fil" : link.title
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
            try d.write(to: url)
            self.sharedFile = url
        }
    }
}
