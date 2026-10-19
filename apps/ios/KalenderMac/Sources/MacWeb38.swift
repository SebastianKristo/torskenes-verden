import SwiftUI
import AppKit
import WebKit
import UserNotifications

/* ---------------- Prompt 38: Kalender for Mac = web-kalenderen ---------------- */
// Hovedvinduet viser samme web-kalender som Homelab på web (<server>/kalender?app=mac, fullskjerm uten Homelab-meny) i en
// WKWebView. Innlogging: app-tokenet fra Nøkkelringen byttes til en vanlig økt-cookie med POST /api/auth/app-session {token}
// før lasting. Native er bare det Mac-spesifikke: vindusramme, menylinje-kalender, Dock-dato, varsler, ⌘-snarveier og widgets.
//
// JS-API (avtalt med WEB38):
//   native → web: window.kalApp.cmd('new'|'today'|'search'|'settings'|'view:dag|3d|uke|mnd|ar|liste'|'prev'|'next'|
//                 'date:YYYY-MM-DD'|'event:<id>'|'new:YYYY-MM-DD'|'glimt'|'glimt:<spørsmål>'|'sidebar'|'goto'|'newcal'|
//                 'weeks:1'|'weeks:0'|'close')
//                 Finnes ikke kalApp ennå, legges kommandoen i window.__kalAppQueue og sendes som CustomEvent 'kalapp:cmd'.
//   web → native: window.webkit.messageHandlers.kalMac.postMessage({type:'ready'|'changed'|'logout'|'open'(url)|
//                 'macSettings'|'notify'(title, body)}) – også som window.kalMac.post(type, data).
//
// Krasj-lærdom fra prompt 36: updateNSView gjør ingenting, ingen NSWindow-endringer per opptegning, og @Published endres bare
// fra nettverks-/WebKit-tilbakekall eller knapper (aldri mens SwiftUI bygger visningen).

enum MacWeb38Phase: Equatable {
    case idle
    case connecting
    case ready
    case failed
}

/// Svak referanse, så innlogging/utlogging og innstillingen kan nå alle vinduene.
final class MacWeb38Box {
    weak var model: MacWeb38Model?

    init(_ m: MacWeb38Model) {
        model = m
    }
}

@MainActor
final class MacWeb38Model: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate {
    private static var boxes: [MacWeb38Box] = []

    @Published private(set) var phase: MacWeb38Phase = .idle
    @Published private(set) var message: String = ""

    private(set) var webView: WKWebView? = nil
    private var proxy: MacWeb38Proxy? = nil
    private var pending: [String] = []
    private var retried: Bool = false
    private var base: String = ""
    private var startTask: Task<Void, Never>? = nil
    private var changeTask: Task<Void, Never>? = nil
    private var generation: Int = 0

    /// Web-visningen er i bruk (ellers vises den innebygde reservekalenderen).
    var active: Bool { MacStore.shared.useWeb38 && MacStore.shared.loggedIn && phase != .failed }

    override init() {
        super.init()
        MacWeb38Model.boxes.removeAll { (b: MacWeb38Box) -> Bool in b.model == nil }
        MacWeb38Model.boxes.append(MacWeb38Box(self))
    }

    static var models: [MacWeb38Model] {
        boxes.compactMap { (b: MacWeb38Box) -> MacWeb38Model? in b.model }
    }

    /* ---------- Livsløp ---------- */

    func start() {
        if phase != .idle { return }
        let s: MacStore = MacStore.shared
        guard s.useWeb38, s.loggedIn, let token = MacSession.token else { return }
        phase = .connecting
        message = "Kobler til Homelab …"
        connect(token: token)
    }

    private func connect(token: String) {
        let bases: [String] = MacSession.bases
        generation += 1
        let gen: Int = generation
        startTask?.cancel()
        startTask = Task { @MainActor [weak self] in
            let r: MacWeb38Session.Outcome = await MacWeb38Session.establish(bases: bases, token: token)
            guard let self, !Task.isCancelled, gen == self.generation else { return }
            if r.base.isEmpty {
                self.fail(r.error)
                return
            }
            self.base = r.base
            let wv: WKWebView = self.ensureWebView()
            let store: WKHTTPCookieStore = wv.configuration.websiteDataStore.httpCookieStore
            for c in r.cookies { await MacWeb38Session.setCookie(c, store) }
            guard gen == self.generation else { return }
            self.loadPage()
        }
    }

    /// «Prøv igjen» i reservevisningen.
    func retry() {
        reset()
        start()
    }

    func reset() {
        generation += 1
        startTask?.cancel()
        startTask = nil
        changeTask?.cancel()
        changeTask = nil
        pending = []
        retried = false
        if let wv = webView {
            wv.stopLoading()
            if let blank = URL(string: "about:blank") { wv.load(URLRequest(url: blank)) }
        }
        if phase != .idle { phase = .idle }
        message = ""
    }

    private func fail(_ msg: String) {
        message = msg.isEmpty ? "Fikk ikke lastet web-kalenderen." : msg
        if phase != .failed { phase = .failed }
    }

    private func markReady() {
        if phase != .connecting { return }
        phase = .ready
        message = ""
        if let wv = webView, let w = wv.window, w.firstResponder !== wv { w.makeFirstResponder(wv) }
        let list: [String] = pending
        pending = []
        for c in list { cmd(c) }
    }

    /// Innlogging/utlogging eller Innstillinger → «Vis web-kalenderen» er endret.
    static func prefChanged() {
        for m in models { m.reset() }
    }

    /// Utlogging: glem økt-cookien og alt nettstedsdata i web-visningen.
    static func signOutAll() {
        for m in models { m.reset() }
        let types: Set<String> = WKWebsiteDataStore.allWebsiteDataTypes()
        WKWebsiteDataStore.default().removeData(ofTypes: types, modifiedSince: Date.distantPast) { }
    }

    /* ---------- Web-visningen ---------- */

    func ensureWebView() -> WKWebView {
        if let wv = webView { return wv }
        let cfg: WKWebViewConfiguration = WKWebViewConfiguration()
        cfg.websiteDataStore = WKWebsiteDataStore.default()
        cfg.applicationNameForUserAgent = "Version/17.0 Safari/605.1.15 KalenderMac/38"
        let ucc: WKUserContentController = WKUserContentController()
        let p: MacWeb38Proxy = MacWeb38Proxy()
        p.model = self
        proxy = p
        ucc.add(p, name: "kalMac")
        ucc.addUserScript(WKUserScript(source: MacWeb38JS.boot, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        cfg.userContentController = ucc
        let wv: WKWebView = WKWebView(frame: NSRect(x: 0, y: 0, width: 1320, height: 860), configuration: cfg)
        wv.navigationDelegate = self
        wv.uiDelegate = self
        wv.allowsBackForwardNavigationGestures = false
        // Klyping/zoom håndteres av web-kalenderen (zoom mellom visningene), ikke som sidezoom.
        wv.allowsMagnification = false
        // Ingen hvit blink i mørkt tema før siden er tegnet.
        wv.setValue(false, forKey: "drawsBackground")
        #if DEBUG
        if #available(macOS 13.3, *) { wv.isInspectable = true }
        #endif
        webView = wv
        return wv
    }

    private func loadPage() {
        guard let wv = webView else { return }
        let s: String = base.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: s + "/kalender?app=mac") else {
            fail("Ugyldig serveradresse.")
            return
        }
        message = "Laster kalenderen …"
        wv.load(URLRequest(url: url))
    }

    /// Økten ble ikke godtatt (401 / sendt til innlogging): prøv å bytte tokenet én gang til, ellers reserve.
    private func reauth() {
        if retried {
            fail("Innloggingen ble ikke godtatt av serveren. Logg ut og inn igjen, eller oppdater Homelab.")
            return
        }
        retried = true
        guard let token = MacSession.token else {
            fail("Ikke logget inn.")
            return
        }
        message = "Fornyer innloggingen …"
        connect(token: token)
    }

    /* ---------- native → web ---------- */

    func cmd(_ c: String) {
        guard let wv = webView, phase == .ready else {
            pending.append(c)
            if pending.count > 20 { pending.removeFirst() }
            return
        }
        if let w = wv.window, w.firstResponder !== wv { w.makeFirstResponder(wv) }
        wv.evaluateJavaScript(MacWeb38JS.cmd(c), completionHandler: nil)
    }

    /* ---------- web → native ---------- */

    func receive(_ body: Any) {
        let o: [String: Any] = (body as? [String: Any]) ?? [:]
        let type: String = (o["type"] as? String) ?? ((body as? String) ?? "")
        switch type {
        case "ready":
            markReady()
        case "changed":
            scheduleReload()
        case "logout":
            MacStore.shared.logout()
        case "open":
            if let s = o["url"] as? String, let u = URL(string: s) { _ = NSWorkspace.shared.open(u) }
        case "macSettings":
            MacApp.activate()
            if let op = MacApp.opener { op(id: "innst") }
        case "notify":
            let title: String = (o["title"] as? String) ?? "Kalender"
            let text: String = (o["body"] as? String) ?? ""
            MacWeb38Notify.post(title: title, body: text)
        default:
            break
        }
    }

    /// Endring i web-kalenderen: menylinja, Dock-merket og varslene henter på nytt (flere endringer på rad gir én henting).
    private func scheduleReload() {
        changeTask?.cancel()
        changeTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 500_000_000)
            if Task.isCancelled { return }
            await MacStore.shared.load(force: true)
        }
    }

    /* ---------- WKNavigationDelegate ---------- */

    private func sameHost(_ url: URL) -> Bool {
        guard let b = URL(string: base) else { return false }
        return (url.host ?? "").lowercased() == (b.host ?? "").lowercased() && url.port == b.port
    }

    private func openExternal(_ url: URL) {
        _ = NSWorkspace.shared.open(url)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = navigationAction.request.url else { return .cancel }
        let scheme: String = (url.scheme ?? "").lowercased()
        if scheme == "about" || scheme == "blob" || scheme == "data" { return .allow }
        if scheme != "http" && scheme != "https" {
            // kalender://, mailto:, tel:, maps: …
            openExternal(url)
            return .cancel
        }
        guard let frame = navigationAction.targetFrame else {
            openExternal(url)
            return .cancel
        }
        if !frame.isMainFrame { return .allow }
        if !sameHost(url) {
            openExternal(url)
            return .cancel
        }
        let path: String = url.path.lowercased()
        if path.hasPrefix("/kalender") || path.hasPrefix("/api/") || path.hasPrefix("/finans/api/") { return .allow }
        if path.hasPrefix("/login") || path.hasPrefix("/finans/login") || path.hasPrefix("/logg-inn") {
            reauth()
            return .cancel
        }
        // Andre Homelab-sider (f.eks. Dashboard) åpnes i nettleseren – vinduet er bare Kalender.
        openExternal(url)
        return .cancel
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse) async -> WKNavigationResponsePolicy {
        if navigationResponse.isForMainFrame, let h = navigationResponse.response as? HTTPURLResponse {
            let code: Int = h.statusCode
            if code == 401 || code == 403 {
                reauth()
                return .cancel
            }
            if code >= 400 {
                fail("Fant ikke web-kalenderen på serveren (" + String(code) + "). Oppdater Homelab, eller bruk den innebygde kalenderen.")
                return .cancel
            }
        }
        return .allow
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if phase == .failed || phase == .idle { return }
        if webView.url?.scheme == "about" { return }
        let gen: Int = generation
        // Siden sier «ready» selv; ellers sjekkes det at web-kalenderen (kalApp) faktisk finnes.
        Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: 300_000_000)
            await self?.probe(gen)
        }
    }

    private func probe(_ gen: Int) async {
        let js: String = "(window.kalApp && typeof window.kalApp.cmd === 'function') ? 1 : 0"
        for _ in 0..<9 {
            guard let wv = webView, gen == generation, phase == .connecting else { return }
            let res: Any? = try? await wv.evaluateJavaScript(js)
            if ((res as? NSNumber)?.intValue ?? 0) == 1 {
                markReady()
                return
            }
            try? await Task.sleep(nanoseconds: 500_000_000)
        }
        // Siden er lastet, men uten kalApp (eldre Homelab): vis den likevel – snarveiene havner i køen på siden.
        if gen == generation && phase == .connecting { markReady() }
    }

    private func ignorable(_ error: Error) -> Bool {
        let e: NSError = error as NSError
        if e.domain == NSURLErrorDomain && e.code == NSURLErrorCancelled { return true }
        // WebKitErrorFrameLoadInterruptedByPolicyChange (vi avbrøt selv i decidePolicy).
        if e.domain == "WebKitErrorDomain" && e.code == 102 { return true }
        return false
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        if ignorable(error) || phase == .idle { return }
        if phase == .connecting { fail(error.localizedDescription) }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if ignorable(error) || phase == .idle { return }
        fail("Fikk ikke kontakt med Homelab: " + error.localizedDescription)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        if phase == .ready { webView.reload() }
    }

    /* ---------- WKUIDelegate ---------- */

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let u = navigationAction.request.url { openExternal(u) }
        return nil
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async {
        let a: NSAlert = NSAlert()
        a.messageText = message
        a.addButton(withTitle: "OK")
        _ = await MacWeb38Panels.run(a, webView.window)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async -> Bool {
        let a: NSAlert = NSAlert()
        a.messageText = message
        a.addButton(withTitle: "OK")
        a.addButton(withTitle: "Avbryt")
        let r: NSApplication.ModalResponse = await MacWeb38Panels.run(a, webView.window)
        return r == .alertFirstButtonReturn
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo) async -> String? {
        let a: NSAlert = NSAlert()
        a.messageText = prompt
        let field: NSTextField = NSTextField(frame: NSRect(x: 0, y: 0, width: 280, height: 24))
        field.stringValue = defaultText ?? ""
        a.accessoryView = field
        a.addButton(withTitle: "OK")
        a.addButton(withTitle: "Avbryt")
        let r: NSApplication.ModalResponse = await MacWeb38Panels.run(a, webView.window)
        return r == .alertFirstButtonReturn ? field.stringValue : nil
    }

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo) async -> [URL]? {
        let p: NSOpenPanel = NSOpenPanel()
        p.allowsMultipleSelection = parameters.allowsMultipleSelection
        p.canChooseDirectories = parameters.allowsDirectories
        p.canChooseFiles = true
        return await MacWeb38Panels.open(p, webView.window)
    }
}

/// Holder meldingsmottakeren svakt (WKUserContentController holder den sterkt – ellers lekker vinduet).
@MainActor
final class MacWeb38Proxy: NSObject, WKScriptMessageHandler {
    weak var model: MacWeb38Model?

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        model?.receive(message.body)
    }
}

@MainActor
enum MacWeb38Panels {
    static func run(_ a: NSAlert, _ w: NSWindow?) async -> NSApplication.ModalResponse {
        guard let w else { return a.runModal() }
        return await withCheckedContinuation { (k: CheckedContinuation<NSApplication.ModalResponse, Never>) in
            a.beginSheetModal(for: w) { (r: NSApplication.ModalResponse) in k.resume(returning: r) }
        }
    }

    static func open(_ p: NSOpenPanel, _ w: NSWindow?) async -> [URL]? {
        guard let w else { return p.runModal() == .OK ? p.urls : nil }
        let ok: Bool = await withCheckedContinuation { (k: CheckedContinuation<Bool, Never>) in
            p.beginSheetModal(for: w) { (r: NSApplication.ModalResponse) in k.resume(returning: r == .OK) }
        }
        return ok ? p.urls : nil
    }
}

/// JavaScript som sendes til siden.
enum MacWeb38JS {
    /// Kjøres før sidens egne skript: forteller web-kalenderen at den kjører i Mac-appen.
    static let boot: String = """
    (function(){
      window.kalMac = { version: '38', platform: 'mac', native: true,
        post: function(t, d){ try { var o = d || {}; o.type = t; window.webkit.messageHandlers.kalMac.postMessage(o); } catch (e) {} } };
      try { if (document.documentElement) document.documentElement.classList.add('kal-app-mac'); } catch (e) {}
    })();
    """

    /// window.kalApp.cmd(c), eller kø + CustomEvent hvis siden ikke er klar ennå.
    static func cmd(_ c: String) -> String {
        let a: String = lit(c)
        return "(function(c){try{if(window.kalApp&&typeof window.kalApp.cmd==='function'){window.kalApp.cmd(c);return 1;}}catch(e){}"
            + "(window.__kalAppQueue=window.__kalAppQueue||[]).push(c);"
            + "try{window.dispatchEvent(new CustomEvent('kalapp:cmd',{detail:c}));}catch(e){}return 0;})(" + a + ");"
    }

    /// Trygg JS-strengliteral via JSON.
    static func lit(_ s: String) -> String {
        if let d = try? JSONSerialization.data(withJSONObject: [s], options: []), let arr = String(data: d, encoding: .utf8), arr.count >= 2 {
            return String(arr.dropFirst().dropLast())
        }
        return "''"
    }
}

/// Bytter app-tokenet til en økt-cookie for web-visningen: POST /api/auth/app-session {token}.
@MainActor
enum MacWeb38Session {
    struct Outcome {
        let base: String
        let cookies: [HTTPCookie]
        let error: String
    }

    static func establish(bases: [String], token: String) async -> Outcome {
        var lastError: String = "Fikk ikke kontakt med serveren."
        if bases.isEmpty { return Outcome(base: "", cookies: [], error: "Ingen serveradresse. Logg inn på nytt.") }
        // Egen økt uten felles cookie-lager: Set-Cookie leses fra svaret og legges i web-visningen.
        let cfg: URLSessionConfiguration = URLSessionConfiguration.ephemeral
        cfg.httpCookieAcceptPolicy = .never
        cfg.httpShouldSetCookies = false
        cfg.timeoutIntervalForRequest = 15
        let session: URLSession = URLSession(configuration: cfg)
        defer { session.finishTasksAndInvalidate() }
        for b in bases {
            let trimmed: String = b.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            guard let url = URL(string: trimmed + "/api/auth/app-session") else { continue }
            var r: URLRequest = URLRequest(url: url)
            r.httpMethod = "POST"
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
            r.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
            r.setValue(MacAuth.deviceName(), forHTTPHeaderField: "X-Device-Name")
            r.httpBody = try? JSONSerialization.data(withJSONObject: ["token": token, "app": "kalender", "device": MacAuth.deviceName()], options: [])
            do {
                let pair: (Data, URLResponse) = try await session.data(for: r)
                guard let h = pair.1 as? HTTPURLResponse else { continue }
                if h.statusCode >= 200 && h.statusCode < 300 {
                    var fields: [String: String] = [:]
                    for (k, v) in h.allHeaderFields {
                        if let ks = k as? String, let vs = v as? String { fields[ks] = vs }
                    }
                    let cookies: [HTTPCookie] = HTTPCookie.cookies(withResponseHeaderFields: fields, for: url)
                    if cookies.isEmpty {
                        lastError = "Serveren ga ingen økt for web-kalenderen."
                        continue
                    }
                    return Outcome(base: trimmed, cookies: cookies, error: "")
                }
                if h.statusCode == 404 {
                    lastError = "Homelab-serveren støtter ikke web-kalenderen i appen ennå (404). Viser den innebygde kalenderen."
                } else if h.statusCode == 401 || h.statusCode == 403 {
                    lastError = "Innloggingen er utløpt eller trukket tilbake. Logg ut og inn igjen."
                } else {
                    let obj: [String: Any] = ((try? JSONSerialization.jsonObject(with: pair.0)) as? [String: Any]) ?? [:]
                    lastError = (obj["error"] as? String) ?? ("Feil " + String(h.statusCode) + " fra serveren.")
                }
            } catch {
                lastError = "Fikk ikke kontakt med Homelab (" + error.localizedDescription + ")."
            }
        }
        return Outcome(base: "", cookies: [], error: lastError)
    }

    static func setCookie(_ c: HTTPCookie, _ store: WKHTTPCookieStore) async {
        await withCheckedContinuation { (k: CheckedContinuation<Void, Never>) in
            store.setCookie(c) { k.resume() }
        }
    }
}

/// Varsel som web-kalenderen ber om (f.eks. Glimt-svar mens vinduet er skjult).
enum MacWeb38Notify {
    static func post(title: String, body: String) {
        let c: UNMutableNotificationContent = UNMutableNotificationContent()
        c.title = title
        c.body = body
        c.sound = .default
        c.threadIdentifier = "kalender"
        let id: String = MacNotify.prefix + "web-" + String(Int(Date().timeIntervalSince1970))
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: c, trigger: nil)) { (_: Error?) in }
    }
}

/* ---------- SwiftUI ---------- */

/// WKWebView-en. updateNSView gjør ingenting (ingen oppdateringsløkker).
struct MacWeb38View: NSViewRepresentable {
    let model: MacWeb38Model

    func makeNSView(context: Context) -> WKWebView {
        let wv: WKWebView = model.ensureWebView()
        // Samme WKWebView gjenbrukes hvis SwiftUI lager verten på nytt.
        if wv.superview != nil { wv.removeFromSuperview() }
        return wv
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {}
}

/// Hovedinnholdet i web-modus: web-kalenderen, med «Kobler til …» til siden er klar.
struct MacWeb38Host: View {
    @Environment(\.mk) private var t
    @ObservedObject var model: MacWeb38Model

    var body: some View {
        ZStack {
            t.bg
            MacWeb38View(model: model)
                .opacity(model.phase == .ready ? 1 : 0)
            if model.phase != .ready {
                VStack(spacing: 12) {
                    ProgressView().controlSize(.small)
                    Text(model.message.isEmpty ? "Kobler til Homelab …" : model.message)
                        .font(MacFont.ui(13)).foregroundColor(t.mut)
                }
            }
        }
        .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)
        .onAppear {
            DispatchQueue.main.async { model.start() }
        }
        .onChange(of: model.phase) { (p: MacWeb38Phase) in
            if p == .idle { DispatchQueue.main.async { model.start() } }
        }
    }
}

/// Stripe over den innebygde reservekalenderen når web-kalenderen ikke kunne lastes.
struct MacWeb38Banner: View {
    @Environment(\.mk) private var t
    @ObservedObject var model: MacWeb38Model

    var body: some View {
        HStack(spacing: 10) {
            Text("Innebygd kalender").font(MacFont.ui(12.5, .bold)).foregroundColor(t.ink)
            Text(model.message).font(MacFont.ui(12)).foregroundColor(t.mut).lineLimit(2)
            Spacer(minLength: 8)
            Button("Prøv igjen") { model.retry() }
                .font(MacFont.ui(12, .semibold))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(t.card)
        .overlay(alignment: .bottom) { Rectangle().fill(t.line).frame(height: 1) }
    }
}
