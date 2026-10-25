import SwiftUI
import UIKit

/* ---------------- Prompt 46: bakgrunn fra et delt Google Photos-album ----------------
 Spesifikasjon: claude-code-bakgrunn-google-photos-album.md. Fasit: Mobil Papir App.dc.html → bakgrunnsmenyen (gp).
 Server (DATA46, server/gphoto46.js – henting, SSRF-vern og cache skjer der, aldri i appen):
   GET    /api/bg/gphoto → {configured, url, count, error, rowText, current:{large, mobile, thumb, textColor}, next, nextChangeAt}
   POST   /api/bg/gphoto {url} → samme (400 invalid_url «Må være en delt album-lenke fra Google Photos», 502 fetch_failed)
   POST   /api/bg/gphoto/refresh · POST /api/bg/gphoto/next · DELETE /api/bg/gphoto
 Valget lagres lokalt som photo = 'gphoto' og synkes som layout.bgType = 'gphoto' (layout.photo godtar ikke verdien ennå). Bildet byttes hver time (serveren velger,
 så alle enheter viser det samme); appen henter på nytt ved neste timeskifte. Feil: siste bilde beholdes. */

@MainActor
@Observable
final class GPhoto46 {
    static let shared = GPhoto46()

    var configured: Bool = false
    var url: String = UserDefaults.standard.string(forKey: "papir_bg_gphoto") ?? ""
    var rowText: String = ""
    var error: String = ""
    var busy: Bool = false
    var editing: Bool = false
    var draft: String = ""
    @ObservationIgnored private var nextAt: Date = .distantPast
    @ObservationIgnored private var timer: Task<Void, Never>? = nil

    nonisolated static func valid(_ s: String) -> Bool {
        let t: String = s.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return t.hasPrefix("https://photos.app.goo.gl/") || t.hasPrefix("https://photos.google.com/share/")
    }

    /// Kalles fra loadPhotoWindow når photo == 'gphoto'. true = bildet er satt (eller beholdt).
    func load(_ store: Store) async -> Bool {
        guard let d = try? await store.api.callAt("/api", "GET", "/bg/gphoto", timeout: 20) else { return store.photoImage != nil }
        return await apply(JS.obj(d), store)
    }

    private func apply(_ o: [String: Any], _ store: Store) async -> Bool {
        configured = JS.bool(o, "configured") ?? false
        if let u = JS.str(o, "url"), !u.isEmpty { url = u; UserDefaults.standard.set(u, forKey: "papir_bg_gphoto") }
        rowText = JS.str(o, "rowText") ?? ""
        error = JS.str(o, "error") ?? ""
        nextAt = JS.date(o["nextChangeAt"]) ?? Date().addingTimeInterval(3600)
        schedule(store)
        guard let cur = JS.dict(o, "current"), let src = JS.str(cur, "mobile") ?? JS.str(cur, "large") else { return store.photoImage != nil }
        if let img = await store.loadBg(src) {
            store.photoImage = img
            Store.storeBg("gphoto", img)
            return true
        }
        return store.photoImage != nil
    }

    /// Nytt bilde ved timeskiftet (samme for alle enheter).
    private func schedule(_ store: Store) {
        timer?.cancel()
        let wait: Double = Swift.max(30, nextAt.timeIntervalSinceNow + 5)
        timer = Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
            if Task.isCancelled || store.photo != "gphoto" { return }
            _ = await self.load(store)
        }
    }

    func use(_ store: Store) {
        let u: String = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard GPhoto46.valid(u) else {
            Haptics.shared.error()
            error = "Må være en delt album-lenke fra Google Photos"
            return
        }
        busy = true
        error = ""
        rowText = "Henter bilder fra albumet …"
        Task { @MainActor in
            defer { self.busy = false }
            do {
                let d: Data = try await store.api.callAt("/api", "POST", "/bg/gphoto", json: ["url": u], timeout: 60)
                self.editing = false
                store.photo = "gphoto"
                // layout.photo godtar ikke 'gphoto' (PHOTO_KINDS i mobile.js) – valget synkes som bgType (DATA46).
                store.savePaperLayout(["bgType": "gphoto"])
                _ = await self.apply(JS.obj(d), store)
                Haptics.shared.success()
                store.paperBgOpen = false
            } catch let e as APIError {
                self.error = e.status == 404 ? "Serveren støtter ikke Google Photos-album ennå. Oppdater Homelab." : e.message
                Haptics.shared.error()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    func retry(_ store: Store) {
        Task { @MainActor in
            _ = try? await store.api.callAt("/api", "POST", "/bg/gphoto/refresh", timeout: 60)
            _ = await self.load(store)
        }
    }

    func next(_ store: Store) {
        Haptics.shared.tap()
        Task { @MainActor in
            guard let d = try? await store.api.callAt("/api", "POST", "/bg/gphoto/next", timeout: 20) else { return }
            _ = await self.apply(JS.obj(d), store)
        }
    }

    func remove(_ store: Store) {
        Haptics.shared.warning()
        Task { @MainActor in
            _ = try? await store.api.callAt("/api", "DELETE", "/bg/gphoto", timeout: 15)
            self.configured = false
            self.url = ""
            UserDefaults.standard.removeObject(forKey: "papir_bg_gphoto")
            self.editing = false
            if store.photo == "gphoto" { store.setPhoto("oslo") }
        }
    }

    /// «photos.app.goo.gl/…» for raden.
    var shortUrl: String {
        url.replacingOccurrences(of: "https://", with: "").prefix(28).description + (url.count > 36 ? "…" : "")
    }
}

/// Raden «Google Photos-album» i bakgrunnsmenyen (under «Eget bilde»), med felt for lenken.
struct GPhoto46Row: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var g: GPhoto46 { GPhoto46.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button {
                Haptics.shared.select()
                if store.photo == "gphoto" && !g.error.isEmpty { g.retry(store); return }
                g.draft = g.url
                g.editing.toggle()
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "photo.stack").font(.dyn51(size: 14, weight: .semibold)).foregroundStyle(p.ink)
                        .frame(width: 30, height: 30)
                        .background(p.card, in: RoundedRectangle(cornerRadius: 8))
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Google Photos-album").font(PF.ui(14, .semibold)).foregroundStyle(p.ink)
                        if store.photo == "gphoto" || !g.rowText.isEmpty {
                            Text(g.error.isEmpty ? (g.rowText.isEmpty ? "Bytter bilde hver time · " + g.shortUrl : g.rowText) : "Fikk ikke hentet albumet · trykk for å prøve igjen")
                                .font(PF.ui(11)).foregroundStyle(g.error.isEmpty ? p.mut : p.lab).lineLimit(2)
                        }
                    }
                    Spacer(minLength: 0)
                    if store.photo == "gphoto" { Text("✓").font(PF.ui(14, .bold)).foregroundStyle(p.ink) }
                }
                .padding(.horizontal, 10).frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .simultaneousGesture(LongPressGesture(minimumDuration: 0.5).onEnded { _ in if store.photo == "gphoto" { g.next(store) } })
            if g.editing { editor }
        }
    }

    private var editor: some View {
        VStack(alignment: .leading, spacing: 6) {
            TextField("https://photos.app.goo.gl/…", text: Binding<String>(get: { g.draft }, set: { g.draft = $0 }))
                .font(PF.mono(12, bold: false)).foregroundStyle(p.ink)
                .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                .padding(.horizontal, 10).frame(height: 40)
                .background(p.card, in: RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(p.line, lineWidth: 1))
            if !g.error.isEmpty { Text(g.error).font(PF.ui(11.5)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true) }
            HStack(spacing: 6) {
                PInkButton(title: g.busy ? "Henter …" : "Bruk album", height: 38) { g.use(store) }
                if g.configured { PLineButton(title: "Fjern", height: 38) { g.remove(store) } }
            }
        }
        .padding(.horizontal, 10).padding(.bottom, 6)
    }
}
