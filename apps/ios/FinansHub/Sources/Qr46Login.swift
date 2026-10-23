import SwiftUI
import UIKit
import CoreImage
import CoreImage.CIFilterBuiltins

/* ---------------- Prompt 46: «Logg inn med QR-kode» i innloggingen (Finans på iPhone/iPad) ----------------
 Spesifikasjon: claude-code-qr-innlogging-finans-kalender.md. Server (SERVER46, qr38.js):
   POST /api/auth/qr/session {app:'finans', platform:'ios', device} → 201 {sessionId, code, expiresAt, ttl:120,
        qr:'papir://login?s=…&c=…&srv=…', server, clientKey}
   GET  /api/auth/qr/session/:id (X-QR-Key: clientKey) → {state: pending|scanned|approved|denied|expired|done, match?, user?}
        Ved godkjenning ÉN gang {state:'done', token, user:{username, name, role}} – et eget token for denne enheten.
 – QR-en har bare sessionId + engangskode + offentlig server-URL, aldri et token. clientKey står aldri i QR-en.
 – Vises stort (maks 320 pt) med nedtelling (2 min) og ny kode automatisk ved utløp. Polling hvert 2. sekund.
 – Serveren mangler endepunktet (404): «Serveren støtter ikke QR-innlogging ennå» + vanlig innlogging.
 Skanneren (innlogget app) er QrLogin38.swift – den forstår nå også papir://login?s=…&c=…. */

@MainActor
@Observable
final class Qr46Show {
    static let shared = Qr46Show()

    var open: Bool = false
    /// loading | show | scanned | done | denied | missing | error
    var phase: String = "loading"
    var qr: String = ""
    var match: String = ""
    var error: String = ""
    var expiresAt: Date = .distantPast
    var server: String = ""
    @ObservationIgnored private var sessionId: String = ""
    @ObservationIgnored private var clientKey: String = ""
    @ObservationIgnored private var loop: Task<Void, Never>? = nil

    func show(_ store: Store) {
        Haptics.shared.tap()
        open = true
        start(store)
    }

    func close() {
        loop?.cancel()
        loop = nil
        open = false
        phase = "loading"
        qr = ""
        sessionId = ""
        clientKey = ""
    }

    func start(_ store: Store) {
        loop?.cancel()
        phase = "loading"
        error = ""
        match = ""
        loop = Task { @MainActor in
            let base: String = await Server41.shared.pick(store) ?? Server41.defaultServer
            self.server = base
            while !Task.isCancelled {
                guard await self.create(base) else { return }
                let finished: Bool = await self.poll(base, store)
                if finished || Task.isCancelled { return }
            }
        }
    }

    /// Ny innloggingsøkt. false = stopp (feil eller mangler på serveren).
    private func create(_ base: String) async -> Bool {
        let body: [String: Any] = ["app": "finans", "platform": "ios", "device": UIDevice.current.name]
        do {
            let d: Data = try await API(base: base, token: nil).callAt("/api", "POST", "/auth/qr/session", json: body, timeout: 15)
            let o: [String: Any] = JS.obj(d)
            sessionId = JS.str(o, "sessionId") ?? JS.str(o, "id") ?? ""
            clientKey = JS.str(o, "clientKey") ?? ""
            qr = JS.str(o, "qr") ?? ""
            let ttl: Double = JS.num(o, "ttl") ?? 120
            expiresAt = JS.date(o["expiresAt"]) ?? Date().addingTimeInterval(ttl)
            if sessionId.isEmpty || qr.isEmpty { phase = "error"; error = "Uventet svar fra serveren."; return false }
            match = ""
            phase = "show"
            return true
        } catch let e as APIError where e.status == 404 || e.status == 405 {
            phase = "missing"
            return false
        } catch let e as APIError {
            phase = "error"
            error = e.status == 429 ? "For mange forsøk. Vent litt og prøv igjen." : e.message
            return false
        } catch {
            phase = "error"
            self.error = error.localizedDescription
            return false
        }
    }

    /// Spør hvert 2. sekund til koden er brukt eller utløpt. true = ferdig (innlogget eller avvist).
    private func poll(_ base: String, _ store: Store) async -> Bool {
        while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            if Task.isCancelled { return true }
            if Date() >= expiresAt { return false }
            guard let o = await Qr46Show.status(base, sessionId, clientKey) else { continue }
            let st: String = JS.str(o, "state") ?? JS.str(o, "status") ?? "pending"
            switch st {
            case "scanned":
                match = JS.str(o, "match") ?? match
                if phase != "scanned" { Haptics.shared.select(); phase = "scanned" }
            case "done", "approved":
                if let t = JS.str(o, "token"), !t.isEmpty {
                    let u: [String: Any]? = JS.dict(o, "user")
                    phase = "done"
                    Haptics.shared.success()
                    store.adoptToken46(server: base, token: t, username: JS.str(u, "username") ?? "", name: JS.str(u, "name") ?? "",
                                       role: JS.str(u, "role") ?? "")
                    close()
                    return true
                }
            case "denied":
                Haptics.shared.warning()
                phase = "denied"
                return true
            case "expired":
                return false
            default:
                break
            }
        }
        return true
    }

    nonisolated static func status(_ base: String, _ id: String, _ key: String) async -> [String: Any]? {
        let enc: String = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
        guard let u = URL(string: base.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/api/auth/qr/session/" + enc) else { return nil }
        var r: URLRequest = URLRequest(url: u)
        r.timeoutInterval = 10
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        if !key.isEmpty { r.setValue(key, forHTTPHeaderField: "X-QR-Key") }
        guard let pair = try? await URLSession.shared.data(for: r) else { return nil }
        let d: Data = pair.0
        let code: Int = (pair.1 as? HTTPURLResponse)?.statusCode ?? 0
        if code == 404 || code == 410 { return ["state": "expired"] }
        guard code < 400 else { return nil }
        return (try? JSONSerialization.jsonObject(with: d)) as? [String: Any]
    }

    var secondsLeft: Int { Swift.max(0, Int(expiresAt.timeIntervalSinceNow.rounded(.up))) }

    nonisolated static func image(_ text: String) -> UIImage? {
        let f = CIFilter.qrCodeGenerator()
        f.message = Data(text.utf8)
        f.correctionLevel = "M"
        guard let out = f.outputImage?.transformed(by: CGAffineTransform(scaleX: 12, y: 12)) else { return nil }
        let ctx: CIContext = CIContext()
        guard let cg = ctx.createCGImage(out, from: out.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}

/// «Logg inn med QR-kode» under vanlig innlogging.
struct Qr46LoginButton: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        Button { Qr46Show.shared.show(store) } label: {
            HStack(spacing: 8) {
                Image(systemName: "qrcode").font(.system(size: 16, weight: .semibold))
                Text("Logg inn med QR-kode").font(PF.ui(15, .bold))
            }
            .foregroundStyle(p.ink)
            .frame(maxWidth: .infinity, minHeight: 50)
            .overlay(Capsule().stroke(p.line, lineWidth: 1))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

/// Fullskjermen med QR-koden.
struct Qr46ShowView: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Qr46Show { Qr46Show.shared }

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                HStack {
                    Spacer()
                    SheetButton30(kind: .primary, title: "Lukk") { m.close() }
                }
                Text("Logg inn med QR-kode").font(PF.serif(30, medium: true)).foregroundStyle(p.ink).multilineTextAlignment(.center)
                content
                Text("Åpne Papir Finans på en mobil som er logget inn → Innstillinger → Logg inn på annen enhet, og skann koden.")
                    .font(PF.ui(13.5)).foregroundStyle(p.mut).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
                Button { m.close() } label: {
                    Text("Logg inn med brukernavn og passord").font(PF.ui(13.5, .semibold)).foregroundStyle(p.mut).underline()
                }
                .buttonStyle(.plain)
            }
            .padding(24)
            .frame(maxWidth: 420)
            .frame(maxWidth: .infinity)
        }
        .background(p.bg.ignoresSafeArea())
    }

    @ViewBuilder private var content: some View {
        switch m.phase {
        case "missing":
            note("Serveren støtter ikke QR-innlogging ennå. Oppdater Homelab, eller logg inn med passord.")
        case "error":
            VStack(spacing: 10) {
                note(m.error.isEmpty ? "Fikk ikke laget en kode." : m.error)
                PInkButton(title: "Prøv igjen", height: 48, full: true) { m.start(store) }
            }
        case "denied":
            VStack(spacing: 10) {
                note("Innloggingen ble avvist på den andre enheten.")
                PInkButton(title: "Ny kode", height: 48, full: true) { m.start(store) }
            }
        case "show", "scanned":
            Qr46Code()
        default:
            ProgressView().frame(height: 320)
        }
    }

    private func note(_ t: String) -> some View {
        Text(t).font(PF.ui(14)).foregroundStyle(p.ink).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
            .padding(16).frame(maxWidth: .infinity)
            .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

struct Qr46Code: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Qr46Show { Qr46Show.shared }

    var body: some View {
        VStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 24, style: .continuous).fill(Color.white)
                if let img = Qr46Show.image(m.qr) {
                    Image(uiImage: img).interpolation(.none).resizable().scaledToFit().padding(18)
                }
                if m.phase == "scanned" {
                    RoundedRectangle(cornerRadius: 24, style: .continuous).fill(Color.white.opacity(0.9))
                    VStack(spacing: 6) {
                        Text("Skannet").font(PF.ui(13, .bold)).foregroundStyle(Color(hex: "#2f6b4a"))
                        if !m.match.isEmpty { Text(m.match).font(PF.mono(44)).foregroundStyle(Color(hex: "#1b1a17")) }
                        Text("Godkjenn på mobilen").font(PF.ui(13)).foregroundStyle(Color(hex: "#6b665c"))
                    }
                }
            }
            .aspectRatio(1, contentMode: .fit)
            .frame(maxWidth: 320)
            .accessibilityLabel("QR-kode for innlogging")
            TimelineView(.periodic(from: Date(), by: 1)) { _ in
                Text("Ny kode om " + Qr46Code.mmss(m.secondsLeft) + " · " + host).font(PF.mono(11.5, bold: false)).foregroundStyle(p.mut)
            }
        }
    }

    private var host: String { m.server.replacingOccurrences(of: "https://", with: "").replacingOccurrences(of: "http://", with: "") }

    nonisolated static func mmss(_ s: Int) -> String { String(format: "%d:%02d", s / 60, s % 60) }
}

extension View {
    /// Legges på innloggingsskjermen: QR-visningen i fullskjerm.
    func qr46Host(_ p: PaperPalette, _ store: Store) -> some View {
        fullScreenCover(isPresented: Binding<Bool>(get: { Qr46Show.shared.open }, set: { (v: Bool) in if !v { Qr46Show.shared.close() } })) {
            Qr46ShowView().environment(\.paper, p).environment(store)
        }
    }
}
