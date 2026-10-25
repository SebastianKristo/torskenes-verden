import SwiftUI
import UIKit
import AVFoundation

/* ---------------- Prompt 38: «Logg inn på ny enhet» – skanner, godkjenn-ark og ferdig ----------------
   Fasit: design/Logg inn QR.dc.html (mobilen): mørk kameraflate med rammen 210 × 210 (radius 24, hvit kant 3) og oransje
   skannelinje (qrScan 1,4 s), «Hold mobilen over koden». Arket: håndtak, «Logge inn på ny enhet?» (Newsreader 22), boksen
   Enhet · Sted · Konto · Kode, hint om matchkoden, «Godkjenn med Face ID» (ink-pille 50) og «Avvis» (rød tekst, kant).
   Godkjent med 2FA: grønn ✓ «Godkjent» + «Skriv koden fra autentiseringsappen på den nye enheten for å fullføre.» */

enum Qr38C {
    static let paper: Color = Color(hex: "#f3efe6")
    static let card: Color = Color(hex: "#fffdf8")
    static let ink: Color = Color(hex: "#1b1a17")
    static let mut: Color = Color(hex: "#6b665c")
    static let line: Color = Color(hex: "#ddd5c5")
    static let red: Color = Color(hex: "#b23a2a")
    static let green: Color = Color(hex: "#2f7a4f")
    static let scan: Color = Color(hex: "#ff8a5c")
    static let dark: Color = Color(hex: "#0e0e10")
}

struct Qr38Host: ViewModifier {
    @Environment(Store.self) private var store
    @MainActor private var m: Qr38Model { Qr38Model.shared }

    func body(content: Content) -> some View {
        content
            .fullScreenCover(isPresented: Binding<Bool>(get: { m.open }, set: { (v: Bool) in if !v { m.close() } })) {
                Qr38Screen().environment(store)
            }
            .onChange(of: store.loggedIn) { (_: Bool, v: Bool) in
                if v { m.takePending(store) }
            }
    }
}

struct Qr38Screen: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Qr38Model { Qr38Model.shared }

    var body: some View {
        ZStack {
            Qr38C.dark.ignoresSafeArea()
            if m.phase == "scan" || m.phase == "busy" || m.phase == "error" || m.phase == "ask" || m.phase == "approving" {
                Qr38CameraLayer()
            }
            if m.phase == "ask" || m.phase == "approving" {
                Qr38AskSheet()
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
            if m.phase == "wait2fa" || m.phase == "done" || m.phase == "denied" {
                Qr38ResultView()
                    .transition(.opacity)
            }
        }
        .overlay(alignment: .topLeading) {
            Button { m.close() } label: {
                Image(systemName: "xmark").font(.dyn51(size: 15, weight: .bold))
                    .foregroundStyle(m.phase == "wait2fa" || m.phase == "done" || m.phase == "denied" ? Qr38C.ink : Color.white)
                    .frame(width: 40, height: 40)
                    .background(.ultraThinMaterial, in: Circle())
                    .frame(width: 48, height: 48)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.leading, 12).padding(.top, 6)
            .accessibilityLabel("Lukk")
        }
        .alert("Lim inn kode", isPresented: Binding<Bool>(get: { m.pasteOpen }, set: { (v: Bool) in m.pasteOpen = v })) {
            TextField("homelab://login?c=…", text: Binding<String>(get: { m.pasteText }, set: { (v: String) in m.pasteText = v }))
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled(true)
            Button("Avbryt", role: .cancel) {}
            Button("Fortsett") { m.submitPaste(store) }
        } message: {
            Text("Lim inn lenken eller koden som står under QR-koden på den nye enheten.")
        }
    }
}

/* ---------- Kameraet ---------- */

struct Qr38CameraLayer: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Qr38Model { Qr38Model.shared }
    @State private var denied: Bool = false

    var body: some View {
        ZStack {
            Qr38CameraView(onCode: { (s: String) in m.scanned(s, store) }, onDenied: { denied = true })
                .ignoresSafeArea()
            Color.black.opacity(0.35).ignoresSafeArea().allowsHitTesting(false)
            VStack(spacing: 18) {
                Spacer()
                Text("Logg inn på ny enhet").font(PF.serif(24, medium: true)).foregroundStyle(Color.white)
                Qr38Frame(busy: m.phase == "busy")
                Text(caption).font(PF.ui(13.5, .semibold)).foregroundStyle(Color.white)
                    .multilineTextAlignment(.center).padding(.horizontal, 30)
                    .fixedSize(horizontal: false, vertical: true)
                if !m.error.isEmpty {
                    Text(m.error).font(PF.ui(13, .bold)).foregroundStyle(Color(hex: "#ffb4a6"))
                        .multilineTextAlignment(.center).padding(.horizontal, 30)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
                Button {
                    m.error = ""
                    if let s = UIPasteboard.general.string, Qr38Model.code(fromText: s) != nil { m.pasteText = s }
                    m.pasteOpen = true
                } label: {
                    Text("Lim inn kode").font(PF.ui(14, .bold)).foregroundStyle(Color.white)
                        .padding(.horizontal, 20).frame(height: 44)
                        .background(Color.white.opacity(0.16), in: Capsule())
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .padding(.bottom, 26)
            }
        }
    }

    private var caption: String {
        if denied { return "Kameraet er avslått. Slå det på i Innstillinger → FinansHub, eller lim inn koden." }
        if m.phase == "busy" { return "Henter enheten …" }
        return "Hold mobilen over QR-koden på den nye enheten"
    }
}

/// Rammen (210 × 210, radius 24, hvit kant) med skannelinjen som går opp og ned (1,4 s).
struct Qr38Frame: View {
    let busy: Bool
    @Environment(\.accessibilityReduceMotion) private var reduce
    @State private var down: Bool = false

    var body: some View {
        ZStack(alignment: .top) {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(Color.white.opacity(0.04))
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .strokeBorder(Color.white.opacity(0.85), lineWidth: 3)
            if busy {
                ProgressView().tint(Color.white).controlSize(.large)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if !reduce {
                Capsule().fill(Qr38C.scan)
                    .frame(height: 2)
                    .shadow(color: Qr38C.scan, radius: 6)
                    .padding(.horizontal, 17)
                    .offset(y: down ? 180 : 17)
            }
        }
        .frame(width: 210, height: 210)
        .onAppear {
            if reduce { return }
            withAnimation(.easeInOut(duration: 0.7).repeatForever(autoreverses: true)) { down = true }
        }
        .accessibilityHidden(true)
    }
}

/// AVFoundation: bakkameraet med AVCaptureMetadataOutput for QR-koder.
struct Qr38CameraView: UIViewControllerRepresentable {
    let onCode: (String) -> Void
    let onDenied: () -> Void

    func makeUIViewController(context: Context) -> Qr38CameraVC {
        let vc: Qr38CameraVC = Qr38CameraVC()
        vc.onCode = onCode
        vc.onDenied = onDenied
        return vc
    }

    func updateUIViewController(_ vc: Qr38CameraVC, context: Context) {
        vc.onCode = onCode
        vc.onDenied = onDenied
    }

    static func dismantleUIViewController(_ vc: Qr38CameraVC, coordinator: ()) {
        vc.stop()
    }
}

final class Qr38CameraVC: UIViewController {
    var onCode: ((String) -> Void)? = nil
    var onDenied: (() -> Void)? = nil
    private let session: AVCaptureSession = AVCaptureSession()
    private let catcher: Qr38Catcher = Qr38Catcher()
    private var preview: AVCaptureVideoPreviewLayer? = nil
    private var configured: Bool = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor.black
        catcher.found = { [weak self] (s: String) in self?.onCode?(s) }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            configure()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] (ok: Bool) in
                Task { @MainActor in
                    if ok { self?.configure() } else { self?.onDenied?() }
                }
            }
        default:
            onDenied?()
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        preview?.frame = view.bounds
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        stop()
    }

    private func configure() {
        if configured { return }
        configured = true
        guard let dev = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
              let input = try? AVCaptureDeviceInput(device: dev), session.canAddInput(input) else {
            onDenied?()
            return
        }
        session.beginConfiguration()
        session.addInput(input)
        let out: AVCaptureMetadataOutput = AVCaptureMetadataOutput()
        if session.canAddOutput(out) {
            session.addOutput(out)
            out.setMetadataObjectsDelegate(catcher, queue: DispatchQueue.main)
            if out.availableMetadataObjectTypes.contains(.qr) { out.metadataObjectTypes = [.qr] }
        }
        session.commitConfiguration()
        let layer: AVCaptureVideoPreviewLayer = AVCaptureVideoPreviewLayer(session: session)
        layer.videoGravity = .resizeAspectFill
        layer.frame = view.bounds
        view.layer.addSublayer(layer)
        preview = layer
        let s: AVCaptureSession = session
        DispatchQueue.global(qos: .userInitiated).async { s.startRunning() }
    }

    func stop() {
        let s: AVCaptureSession = session
        if s.isRunning { DispatchQueue.global(qos: .userInitiated).async { s.stopRunning() } }
    }
}

/// Egen delegat (ikke MainActor-klassen), så protokollen ikke krysser aktørgrenser. Kalles på hovedkøen.
final class Qr38Catcher: NSObject, AVCaptureMetadataOutputObjectsDelegate {
    var found: ((String) -> Void)? = nil
    private var last: String = ""
    private var lastAt: Date = .distantPast

    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard let o = metadataObjects.first as? AVMetadataMachineReadableCodeObject, let s = o.stringValue, !s.isEmpty else { return }
        // Samme kode leses mange ganger i sekundet: send den videre høyst hvert 2. sekund.
        if s == last && Date().timeIntervalSince(lastAt) < 2 { return }
        last = s
        lastAt = Date()
        let f: ((String) -> Void)? = found
        DispatchQueue.main.async { f?(s) }
    }
}

/* ---------- Arket «Logge inn på ny enhet?» ---------- */

struct Qr38AskSheet: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Qr38Model { Qr38Model.shared }

    var body: some View {
        ZStack(alignment: .bottom) {
            Color.black.opacity(0.4).ignoresSafeArea()
                .contentShape(Rectangle())
                .onTapGesture {}
            VStack(alignment: .leading, spacing: 12) {
                Capsule().fill(Qr38C.line).frame(width: 36, height: 5).frame(maxWidth: .infinity)
                Text("Logge inn på ny enhet?").font(PF.serif(22, medium: true)).foregroundStyle(Qr38C.ink)
                Qr38InfoBox()
                Text(hint).font(PF.ui(12)).foregroundStyle(Qr38C.mut).fixedSize(horizontal: false, vertical: true)
                Button { m.approve(store) } label: {
                    HStack(spacing: 8) {
                        if m.phase == "approving" { ProgressView().tint(Qr38C.paper) }
                        Image(systemName: "faceid").font(.dyn51(size: 16, weight: .semibold))
                        Text("Godkjenn med Face ID").font(PF.ui(15, .heavy))
                    }
                    .foregroundStyle(Qr38C.paper)
                    .frame(maxWidth: .infinity).frame(height: 50)
                    .background(Qr38C.ink, in: Capsule())
                    .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .disabled(m.phase == "approving")
                Button { m.deny(store) } label: {
                    Text("Avvis").font(PF.ui(14, .bold)).foregroundStyle(Qr38C.red)
                        .frame(maxWidth: .infinity).frame(height: 44)
                        .overlay(Capsule().strokeBorder(Qr38C.line, lineWidth: 1))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .disabled(m.phase == "approving")
            }
            .padding(.horizontal, 18).padding(.top, 12).padding(.bottom, 36)
            .background(Qr38C.card, in: UnevenRoundedRectangle(topLeadingRadius: 28, bottomLeadingRadius: 0, bottomTrailingRadius: 0, topTrailingRadius: 28, style: .continuous))
            .environment(\.colorScheme, .light)
        }
        .ignoresSafeArea(edges: .bottom)
    }

    private var hint: String {
        if m.match.isEmpty { return "Godkjenn bare hvis det er deg som logger inn på den nye enheten." }
        return "Sjekk at tallene " + m.match + " også står på den nye skjermen. Godkjenn bare hvis det er deg."
    }
}

struct Qr38InfoBox: View {
    @MainActor private var m: Qr38Model { Qr38Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            row("Enhet", m.device.title, mono: false)
            row("Sted", m.device.where38, mono: false)
            row("Konto", m.account, mono: false)
            if !m.match.isEmpty { row("Kode", m.match, mono: true) }
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .background(Qr38C.paper, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func row(_ k: String, _ v: String, mono: Bool) -> some View {
        HStack(spacing: 8) {
            Text(k).font(PF.ui(13)).foregroundStyle(Qr38C.mut)
            Spacer(minLength: 8)
            Text(v).font(mono ? PF.mono(15) : PF.ui(13, .bold)).foregroundStyle(Qr38C.ink).lineLimit(1)
        }
    }
}

/* ---------- Godkjent / avvist ---------- */

struct Qr38ResultView: View {
    @MainActor private var m: Qr38Model { Qr38Model.shared }
    @State private var pop: Bool = false

    var body: some View {
        ZStack {
            Qr38C.paper.ignoresSafeArea()
            VStack(spacing: 12) {
                Text(m.phase == "denied" ? "×" : "✓").font(PF.ui(m.phase == "denied" ? 28 : 26, .heavy)).foregroundStyle(Color.white)
                    .frame(width: 60, height: 60)
                    .background(m.phase == "denied" ? Qr38C.red : Qr38C.green, in: Circle())
                    .scaleEffect(pop ? 1 : 0.5)
                    .opacity(pop ? 1 : 0)
                Text(title).font(PF.serif(22, medium: true)).foregroundStyle(Qr38C.ink).multilineTextAlignment(.center)
                Text(sub).font(PF.ui(13)).foregroundStyle(Qr38C.mut).multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                Button { m.close() } label: {
                    Text("Ferdig").font(PF.ui(14, .bold)).foregroundStyle(Qr38C.paper)
                        .padding(.horizontal, 24).frame(height: 44)
                        .background(Qr38C.ink, in: Capsule())
                }
                .buttonStyle(.plain)
                .padding(.top, 8)
            }
            .padding(.horizontal, 28)
            .frame(maxWidth: 420)
        }
        .environment(\.colorScheme, .light)
        .onAppear { withAnimation(.spring(response: 0.4, dampingFraction: 0.55)) { pop = true } }
    }

    private var title: String {
        switch m.phase {
        case "wait2fa": return "Godkjent"
        case "denied": return "Innloggingen ble avvist"
        default: return "Logget inn på ny enhet"
        }
    }

    private var sub: String {
        switch m.phase {
        case "wait2fa": return "Skriv koden fra autentiseringsappen på den nye enheten for å fullføre."
        case "denied": return "Den nye enheten får beskjed og viser en ny kode."
        default: return m.device.title + " er lagt til under Pålitelige enheter."
        }
    }
}

/// Raden «Logg inn på ny enhet · Skann QR-koden på skjermen» (Konto, fasiten: ikonbrikke med QR-ikon i blått).
struct Qr38KontoRow: View {
    @Environment(\.paper) private var p

    var body: some View {
        Button { Qr38Model.shared.show() } label: {
            HStack(spacing: 12) {
                Image(systemName: "qrcode.viewfinder").font(.dyn51(size: 15, weight: .semibold))
                    .foregroundStyle(Color(hex: "#2b5d8a"))
                    .frame(width: 30, height: 30)
                    .background(Color(hex: "#2b5d8a").opacity(0.12), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                VStack(alignment: .leading, spacing: 1) {
                    Text("Logg inn på annen enhet").font(PF.ui(14.5, .bold)).foregroundStyle(p.ink)
                    Text("Kalender på Mac, iPhone, Android eller Finans – skann QR-koden").font(PF.ui(12)).foregroundStyle(p.mut)
                }
                Spacer(minLength: 6)
                Text("›").font(PF.ui(17)).foregroundStyle(p.mut)
            }
            .padding(.horizontal, 14).frame(minHeight: 56)
            .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}
