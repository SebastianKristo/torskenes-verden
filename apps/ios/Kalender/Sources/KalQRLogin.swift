import SwiftUI
import UIKit
import AVFoundation
import LocalAuthentication

/* ---------------- Prompt 38: Kalender (iPhone/iPad) – logg inn med QR fra en mobil som allerede er innlogget ---------------- */
// Mest nyttig på iPad: koden skannes med Homelab på telefonen (Konto → Logg inn på ny enhet), godkjennes med Face ID,
// og 2FA-koden skrives her. Logikken ligger i SharedKal/Core/KalQRCore.swift (delt med Kalender for Mac).

struct KalQRLogin38Panel: View {
    @Environment(\.kal) private var t
    @State private var m: KalQR38Model = KalQR38Model()
    let base: String
    let onPassword: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if m.state == "twofa" {
                twofa
            } else {
                qrBlock
            }
            Button(action: onPassword) {
                Text("Logg inn med passord i stedet").font(KalFont.ui(14, .semibold)).foregroundStyle(t.acc)
            }
            .buttonStyle(.plain)
        }
        .onAppear {
            let b: String = base
            DispatchQueue.main.async {
                let model: String = UIDevice.current.model
                m.companionDevice = model
                m.onLogin = { (server: String, token: String, name: String) in
                    UserDefaults.standard.set(server, forKey: "kal.lastServer")
                    KalStore.shared.didLogin(bases: [server], token: token, user: name)
                }
                m.start(base: b, device: "Kalender (" + model + ")")
            }
        }
        .onDisappear { m.stop() }
    }

    private var qrBlock: some View {
        VStack(alignment: .center, spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 18).fill(Color.white)
                if let img = m.image {
                    Image(decorative: img, scale: 1).resizable().interpolation(.none).frame(width: 200, height: 200)
                        .opacity(m.state == "scanned" ? 0.18 : 1)
                    ZStack {
                        Circle().fill(Color.white).frame(width: 46, height: 46)
                        Text("✦").font(KalFont.ui(22, .bold)).foregroundStyle(t.red)
                    }
                    .opacity(m.state == "scanned" ? 0 : 1)
                } else {
                    ProgressView()
                }
                if m.state == "scanned" {
                    VStack(spacing: 6) {
                        Circle().fill(t.red).frame(width: 48, height: 48)
                            .overlay(Text(String(m.scannedBy.prefix(1)).uppercased()).font(KalFont.ui(20, .bold)).foregroundStyle(Color.white))
                        Text(m.match).font(KalFont.mono(30)).foregroundStyle(Color.black)
                    }
                }
            }
            .frame(width: 224, height: 224)
            .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(t.line, lineWidth: 1))
            Text(headline).font(KalFont.ui(16, .bold)).foregroundStyle(t.ink).multilineTextAlignment(.center)
            Text(detail).font(KalFont.ui(13)).foregroundStyle(t.mut).multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            if m.state == "pending" {
                Text("Koden fornyes om " + String(m.secondsLeft) + " s").font(KalFont.mono(12)).foregroundStyle(t.mut2)
            }
            if m.state == "denied" || m.state == "error" {
                Text(m.error).font(KalFont.ui(13)).foregroundStyle(t.acc).multilineTextAlignment(.center)
                Button("Ny kode") { m.renew() }.font(KalFont.ui(14, .semibold))
            }
        }
        .frame(maxWidth: .infinity)
    }

    private var headline: String {
        switch m.state {
        case "scanned": return "Skannet av " + (m.scannedBy.isEmpty ? "mobilen" : m.scannedBy)
        case "denied": return "Innloggingen ble avvist"
        case "done": return "Logget inn"
        default: return "Logg inn med mobilen"
        }
    }

    private var detail: String {
        if m.state == "scanned" { return "Godkjenn på mobilen … Sjekk at tallet " + m.match + " også vises der." }
        // Prompt 46: Papir Finans (eller en innlogget Kalender) på mobilen skanner koden.
        return "Skann med Homelab på mobilen: Innstillinger → Enheter og widgets → Logg inn på annen enhet. En innlogget Kalender kan også skanne."
    }

    private var twofa: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Totrinnsbekreftelse").font(KalFont.serif(28)).foregroundStyle(t.ink)
            Text("Skriv den 6-sifrede koden fra autentiseringsappen, eller en reservekode.")
                .font(KalFont.ui(14)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
            TextField("Kode", text: $m.code)
                .font(KalFont.ui(16, .medium)).foregroundStyle(t.ink)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .padding(.horizontal, 14).frame(height: 50)
                .background(RoundedRectangle(cornerRadius: 16).fill(t.card))
                .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(t.line, lineWidth: 1))
            if !m.error.isEmpty {
                Text(m.error).font(KalFont.ui(13)).foregroundStyle(t.acc)
            }
            Button(action: { m.submitCode() }) {
                HStack {
                    if m.busy { ProgressView().tint(t.bg) }
                    Text("Bekreft").font(KalFont.ui(15, .bold))
                }
                .foregroundStyle(t.bg)
                .frame(maxWidth: .infinity).frame(height: 50)
                .background(Capsule().fill(m.code.count >= 6 && !m.busy ? t.ink : t.mut2))
            }
            .buttonStyle(.plain)
            .disabled(m.code.count < 6 || m.busy)
        }
    }
}

/* ---------------- Prompt 46: QR-innlogging i Kalender (iPhone/iPad) – vis koden ved innlogging, skann når innlogget ---------------- */
// Spesifikasjon: claude-code-qr-innlogging-finans-kalender.md. Bygger på QR-flyten fra prompt 38 (server/qr38.js, KalQR38).
// Vis: innloggingsskjermen (prompt 41) hadde mistet «Logg inn med QR fra mobilen» – den lå bare i den gamle skjermen med
// serverfelt. Nå er «Logg inn med QR-kode» et valg på startsiden igjen (koden fornyes selv, 2FA som før).
// Skann: Innstillinger → Logg inn på annen enhet. Kameraet leser koden (homelab://login?c=…, https://<server>/l/…,
// papir://login?s=…&c=…&srv=…), POST /api/auth/qr/scan {code} viser enhet, sted og matchkode, Face ID/kode kreves før
// POST /api/auth/qr/approve {sid, approve, biometric:true, match}. Koden sendes bare til serveren DENNE appen er logget inn
// på – aldri til adressen i QR-en (srv brukes bare til å advare om at koden er fra en annen server). QR-en har aldri et token.

/* ---------- Vis (innloggingsskjermen) ---------- */

struct KalLoginQR46: View {
    @MainActor private var m: KalLogin41Model { KalLogin41Model.shared }

    private var base: String {
        KalSrv46.clean(KalAuth41.candidates()).first ?? KalAuth41.defaultBase
    }

    var body: some View {
        KalQRLogin38Panel(base: base, onPassword: {
            KalHaptic.tap()
            m.phase = "start"
        })
        .frame(maxWidth: 320)
    }
}

/// «Logg inn med QR-kode» på startsiden.
struct KalLoginQRButton46: View {
    @Environment(\.kal) private var t
    @MainActor private var m: KalLogin41Model { KalLogin41Model.shared }

    var body: some View {
        Button(action: {
            KalHaptic.tap()
            m.error = ""
            m.phase = "qr"
        }) {
            Text("Logg inn med QR-kode").font(KalFont.ui(13.5, .bold)).foregroundStyle(t.ink)
                .frame(maxWidth: .infinity).frame(height: 44)
                .overlay(Capsule().strokeBorder(t.line, lineWidth: 1))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityHint("Vis en QR-kode som du skanner med Homelab på mobilen")
    }
}

/* ---------- Skann (innlogget) ---------- */

struct KalQRAsk46: Equatable {
    var sid: String
    var device: String
    var place: String
    var account: String
    var match: String
}

@MainActor
@Observable
final class KalQRScan46Model {
    static let shared: KalQRScan46Model = KalQRScan46Model()
    var open: Bool = false
    /// scan | busy | ask | done | err
    var phase: String = "scan"
    var ask: KalQRAsk46? = nil
    var text: String = ""
    var manual: String = ""
    @ObservationIgnored private var lastCode: String = ""

    func start() {
        KalHaptic.tap()
        phase = "scan"
        ask = nil
        text = ""
        manual = ""
        lastCode = ""
        open = true
    }

    /// <sid>.<nonce> fra en QR-tekst, eller nil.
    nonisolated static func code(_ raw: String) -> String? {
        let v: String = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        func ok(_ s: String) -> Bool {
            let p: [Substring] = s.split(separator: ".")
            if p.count != 2 { return false }
            let allowed: CharacterSet = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_"))
            return p.allSatisfy { (x: Substring) -> Bool in x.count >= 4 && x.unicodeScalars.allSatisfy { (u: Unicode.Scalar) -> Bool in allowed.contains(u) } }
        }
        if ok(v) { return v }
        guard let u = URLComponents(string: v) else { return nil }
        let items: [URLQueryItem] = u.queryItems ?? []
        func q(_ k: String) -> String { items.first(where: { (i: URLQueryItem) -> Bool in i.name == k })?.value ?? "" }
        if ok(q("c")) { return q("c") }
        if !q("s").isEmpty && !q("c").isEmpty && ok(q("s") + "." + q("c")) { return q("s") + "." + q("c") }
        let segs: [String] = u.path.split(separator: "/").map { (x: Substring) -> String in String(x) }
        if let i = segs.firstIndex(of: "l"), i + 1 < segs.count, ok(segs[i + 1]) { return segs[i + 1] }
        if let last = segs.last, ok(last) { return last }
        return nil
    }

    /// Verten i papir://…&srv=… når den er en annen enn serveren appen er logget inn på.
    nonisolated static func otherServer(_ raw: String, own: [String]) -> String? {
        guard let u = URLComponents(string: raw.trimmingCharacters(in: .whitespacesAndNewlines)) else { return nil }
        let srv: String = (u.queryItems ?? []).first(where: { (i: URLQueryItem) -> Bool in i.name == "srv" })?.value ?? ""
        if srv.isEmpty { return nil }
        let h: String = KalSrv46.host(srv)
        if h.isEmpty { return nil }
        let mine: [String] = own.map { (b: String) -> String in KalSrv46.host(b) }
        return mine.contains(h) ? nil : h
    }

    func scanned(_ raw: String) {
        if phase != "scan" { return }
        guard let c = KalQRScan46Model.code(raw) else {
            text = "Det er ikke en innloggingskode. Skann QR-koden som Kalender eller Finans viser."
            return
        }
        if c == lastCode { return }
        lastCode = c
        if let other = KalQRScan46Model.otherServer(raw, own: KalNet.session().0) {
            phase = "err"
            text = "Koden er fra en annen server (" + other + "). Logg inn der i stedet."
            return
        }
        KalHaptic.done()
        phase = "busy"
        text = ""
        Task { @MainActor in await self.lookup(c) }
    }

    private func lookup(_ c: String) async {
        do {
            let d: Data = try await KalNet.send("POST", "/api/auth/qr/scan", json: ["code": c], timeout: KalSrv46.timeout)
            let o: [String: Any] = ((try? JSONSerialization.jsonObject(with: d)) as? [String: Any]) ?? [:]
            let dev: [String: Any] = (o["device"] as? [String: Any]) ?? [:]
            let acc: [String: Any] = (o["account"] as? [String: Any]) ?? [:]
            var name: String = (dev["name"] as? String) ?? ""
            let os: String = (dev["os"] as? String) ?? ""
            if name.isEmpty { name = os.isEmpty ? "Ny enhet" : os } else if !os.isEmpty && !name.contains(os) { name += " · " + os }
            var place: String = (dev["place"] as? String) ?? ""
            let ip: String = (dev["ip"] as? String) ?? ""
            if !ip.isEmpty { place = place.isEmpty ? ip : place + " · " + ip }
            let account: String = (acc["name"] as? String) ?? (acc["username"] as? String) ?? KalStore.shared.userName
            ask = KalQRAsk46(sid: (o["sid"] as? String) ?? "", device: name, place: place, account: account,
                             match: (o["match"] as? String) ?? "")
            phase = "ask"
        } catch let e as KalNetError {
            phase = "err"
            text = KalQRScan46Model.message(e)
        } catch {
            phase = "err"
            text = "Fikk ikke kontakt med serveren."
        }
    }

    nonisolated static func message(_ e: KalNetError) -> String {
        switch e.status {
        case 0: return "Fikk ikke kontakt med serveren. Prøv igjen."
        case 403: return "Denne innloggingen kan ikke godkjenne andre enheter. Bruk Homelab på mobilen, eller logg inn på nytt."
        case 404, 405: return "Serveren har ikke QR-innlogging ennå. Oppdater Homelab-serveren."
        case 409, 410: return "Koden er allerede brukt eller utløpt. Be om en ny kode på den andre enheten."
        case 429: return "For mange forsøk. Vent litt og prøv igjen."
        default: return e.message.isEmpty ? "Kunne ikke lese koden." : e.message
        }
    }

    /// Godkjenn (Face ID/kode først) eller avvis.
    func answer(_ approve: Bool) {
        guard let a = ask else { return }
        KalHaptic.tap()
        Task { @MainActor in
            if approve {
                let ok: Bool = await KalQRScan46Model.biometric()
                if !ok {
                    self.text = "Godkjenningen ble avbrutt."
                    return
                }
            }
            self.phase = "busy"
            do {
                let body: [String: Any] = ["sid": a.sid, "approve": approve, "biometric": approve, "match": a.match]
                let d: Data = try await KalNet.send("POST", "/api/auth/qr/approve", json: body, timeout: KalSrv46.timeout)
                let o: [String: Any] = ((try? JSONSerialization.jsonObject(with: d)) as? [String: Any]) ?? [:]
                let two: Bool = (o["needs2fa"] as? Bool) ?? false
                self.ask = nil
                self.phase = "done"
                if !approve {
                    self.text = "Innloggingen ble avvist. Den andre enheten får en ny kode."
                } else if two {
                    self.text = "Godkjent. Skriv koden fra autentiseringsappen på den andre enheten for å fullføre."
                } else {
                    self.text = a.device + " er logget inn som " + a.account + ". Du finner den under Innstillinger → Enheter og widgets i Homelab."
                }
            } catch let e as KalNetError {
                self.phase = "err"
                self.text = KalQRScan46Model.message(e)
            } catch {
                self.phase = "err"
                self.text = "Fikk ikke kontakt med serveren."
            }
        }
    }

    /// Face ID / Touch ID, med enhetskoden som reserve.
    static func biometric() async -> Bool {
        let ctx: LAContext = LAContext()
        var err: NSError? = nil
        if !ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &err) { return false }
        do {
            return try await ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Logg inn den andre enheten på kontoen din")
        } catch {
            return false
        }
    }

    func again() {
        phase = "scan"
        text = ""
        ask = nil
        lastCode = ""
    }
}

/// Innstillinger → GLIMT OG KONTO → «Logg inn på annen enhet».
struct KalQRScan46Row: View {
    @Environment(\.kal) private var t
    @MainActor private var m: KalQRScan46Model { KalQRScan46Model.shared }

    var body: some View {
        KalLinkRow35(title: "Logg inn på annen enhet", sub: "Skann QR-koden Kalender på Mac, Android eller iPad viser") { m.start() }
            .sheet(isPresented: Binding(get: { m.open }, set: { (v: Bool) in if m.open != v { m.open = v } })) {
                KalQRScan46Sheet().environment(\.kal, t)
            }
    }
}

struct KalQRScan46Sheet: View {
    @Environment(\.kal) private var t
    @MainActor private var m: KalQRScan46Model { KalQRScan46Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Logg inn på annen enhet").font(KalFont.serif(24)).foregroundStyle(t.ink)
                Spacer()
                KalPill(title: "Lukk", filled: false) { m.open = false }
            }
            content
            Spacer(minLength: 0)
        }
        .padding(20)
        .frame(maxWidth: 520)
        .frame(maxWidth: .infinity)
        .background(t.bg.ignoresSafeArea())
    }

    @ViewBuilder private var content: some View {
        switch m.phase {
        case "ask": KalQRAskView46()
        case "busy": ProgressView().controlSize(.large).tint(t.red).frame(maxWidth: .infinity).padding(.top, 40)
        case "done", "err": KalQRResult46()
        default: KalQRCamera46Block()
        }
    }
}

struct KalQRCamera46Block: View {
    @Environment(\.kal) private var t
    @MainActor private var m: KalQRScan46Model { KalQRScan46Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Rett kameraet mot QR-koden på enheten som skal logges inn.").font(KalFont.ui(13.5)).foregroundStyle(t.mut)
                .fixedSize(horizontal: false, vertical: true)
            KalQRCamera46 { (s: String) in m.scanned(s) }
                .frame(maxWidth: 320, maxHeight: 320)
                .aspectRatio(1, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(t.line, lineWidth: 1))
                .frame(maxWidth: .infinity)
            if !m.text.isEmpty {
                Text(m.text).font(KalFont.ui(13)).foregroundStyle(t.acc).fixedSize(horizontal: false, vertical: true)
            }
            manualRow
        }
    }

    private var manualRow: some View {
        HStack(spacing: 8) {
            TextField("Eller lim inn koden", text: Binding(get: { m.manual }, set: { (v: String) in m.manual = v }))
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled(true)
                .font(KalFont.ui(14, .medium)).foregroundStyle(t.ink)
                .padding(.horizontal, 12).frame(height: 44)
                .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(t.line, lineWidth: 1))
            KalPill(title: "Fortsett", enabled: !m.manual.isEmpty) { m.scanned(m.manual) }
        }
    }
}

struct KalQRAskView46: View {
    @Environment(\.kal) private var t
    @MainActor private var m: KalQRScan46Model { KalQRScan46Model.shared }

    var body: some View {
        let a: KalQRAsk46 = m.ask ?? KalQRAsk46(sid: "", device: "", place: "", account: "", match: "")
        VStack(alignment: .leading, spacing: 12) {
            Text("Logge inn " + a.device + "?").font(KalFont.ui(16, .bold)).foregroundStyle(t.ink)
                .fixedSize(horizontal: false, vertical: true)
            if !a.place.isEmpty { Text(a.place).font(KalFont.ui(13)).foregroundStyle(t.mut) }
            Text("Som " + a.account).font(KalFont.ui(13)).foregroundStyle(t.mut)
            if !a.match.isEmpty {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Sjekk at tallet også vises på den andre skjermen").font(KalFont.ui(12)).foregroundStyle(t.mut)
                    Text(a.match).font(KalFont.mono(34)).foregroundStyle(t.ink)
                }
            }
            if !m.text.isEmpty { Text(m.text).font(KalFont.ui(13)).foregroundStyle(t.acc) }
            HStack(spacing: 8) {
                KalPill(title: "Logg inn", height: 44) { m.answer(true) }
                KalPill(title: "Avbryt", filled: false, height: 44) { m.answer(false) }
            }
        }
    }
}

struct KalQRResult46: View {
    @Environment(\.kal) private var t
    @MainActor private var m: KalQRScan46Model { KalQRScan46Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(m.phase == "done" ? "Ferdig" : "Fikk ikke logget inn").font(KalFont.ui(16, .bold)).foregroundStyle(t.ink)
            Text(m.text).font(KalFont.ui(13.5)).foregroundStyle(m.phase == "done" ? t.ink : t.acc).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 8) {
                KalPill(title: "Skann en ny kode", filled: false, height: 44) { m.again() }
                KalPill(title: "Ferdig", height: 44) { m.open = false }
            }
        }
    }
}

/* ---------- Kamera (AVFoundation, QR) ---------- */

struct KalQRCamera46: UIViewControllerRepresentable {
    let onCode: (String) -> Void

    func makeUIViewController(context: Context) -> KalQRCamera46VC {
        let vc: KalQRCamera46VC = KalQRCamera46VC()
        vc.onCode = onCode
        return vc
    }

    func updateUIViewController(_ vc: KalQRCamera46VC, context: Context) {
        vc.onCode = onCode
    }
}

final class KalQRCamera46VC: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var onCode: ((String) -> Void)? = nil
    private let session: AVCaptureSession = AVCaptureSession()
    private var preview: AVCaptureVideoPreviewLayer? = nil
    private let label: UILabel = UILabel()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor.black
        label.textColor = UIColor.white
        label.numberOfLines = 0
        label.textAlignment = .center
        label.font = UIFont.systemFont(ofSize: 14, weight: .semibold)
        label.frame = view.bounds.insetBy(dx: 16, dy: 16)
        label.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(label)
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            setup()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { (ok: Bool) in
                DispatchQueue.main.async { [weak self] in
                    if ok { self?.setup() } else { self?.denied() }
                }
            }
        default:
            denied()
        }
    }

    private func denied() {
        label.text = "Kalender har ikke tilgang til kameraet. Slå det på i Innstillinger → Kalender → Kamera, eller lim inn koden under."
    }

    private func setup() {
        guard let dev = AVCaptureDevice.default(for: .video), let input = try? AVCaptureDeviceInput(device: dev) else {
            label.text = "Fant ikke kameraet. Lim inn koden under."
            return
        }
        if session.canAddInput(input) { session.addInput(input) }
        let out: AVCaptureMetadataOutput = AVCaptureMetadataOutput()
        if session.canAddOutput(out) {
            session.addOutput(out)
            out.setMetadataObjectsDelegate(self, queue: DispatchQueue.main)
            if out.availableMetadataObjectTypes.contains(.qr) { out.metadataObjectTypes = [.qr] }
        }
        let p: AVCaptureVideoPreviewLayer = AVCaptureVideoPreviewLayer(session: session)
        p.videoGravity = .resizeAspectFill
        p.frame = view.bounds
        view.layer.insertSublayer(p, at: 0)
        preview = p
        let s: AVCaptureSession = session
        // startRunning blokkerer – aldri på hovedtråden.
        DispatchQueue.global(qos: .userInitiated).async { s.startRunning() }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        preview?.frame = view.bounds
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        let s: AVCaptureSession = session
        DispatchQueue.global(qos: .utility).async { if s.isRunning { s.stopRunning() } }
    }

    nonisolated func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard let o = metadataObjects.first as? AVMetadataMachineReadableCodeObject, let v = o.stringValue else { return }
        DispatchQueue.main.async { [weak self] in self?.onCode?(v) }
    }
}
