import SwiftUI
import UIKit
import UserNotifications

/* ---------------- Prompt 41: Kalender – testvarsel (Innstillinger → VARSLER øverst) ---------------- */
// Fasit: Kalender App.dc.html → notTest / ntBan. Trykk: ekte lokalt varsel om 5 s via samme kanal som påminnelsene
// (UNUserNotificationCenter, kategori KAL_EVENT), «Kalender · test» / «Tannlege kl. 17:30 · om 15 min. Varsler virker.».
// Mangler tillatelse: spør først. Avslått: «Varsler er slått av for Kalender» + «Åpne Innstillinger».
// Er appen åpen når varselet kommer: banneret vises også i appen. Lang-trykk: push fra serveren
// (POST /api/kalender/notify/test, reserve POST /api/push/test {app:"kalender"}).

@MainActor
@Observable
final class KalNotify41 {
    static let shared: KalNotify41 = KalNotify41()

    var banner: Bool = false
    var denied: Bool = false
    /// «Push sendt · kom fram på 1,2 s» eller feilen.
    var pushText: String = ""
    @ObservationIgnored private var seq: Int = 0

    nonisolated static let title: String = "Kalender · test"
    nonisolated static let bodyText: String = "Tannlege kl. 17:30 · om 15 min. Varsler virker."

    func test() {
        KalHaptic.tap()
        Task {
            let center: UNUserNotificationCenter = UNUserNotificationCenter.current()
            let st: UNNotificationSettings = await center.notificationSettings()
            var allowed: Bool = st.authorizationStatus == .authorized || st.authorizationStatus == .provisional || st.authorizationStatus == .ephemeral
            if st.authorizationStatus == .notDetermined {
                allowed = (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
            }
            if !allowed {
                denied = true
                return
            }
            denied = false
            let c: UNMutableNotificationContent = UNMutableNotificationContent()
            c.title = KalNotify41.title
            c.body = KalNotify41.bodyText
            c.sound = .default
            c.categoryIdentifier = KalNotify.category
            c.threadIdentifier = "kalender"
            c.userInfo = ["url": "kalender://", "title": c.title, "body": c.body, "test41": true]
            let trig: UNTimeIntervalNotificationTrigger = UNTimeIntervalNotificationTrigger(timeInterval: 5, repeats: false)
            let req: UNNotificationRequest = UNNotificationRequest(identifier: KalNotify.prefix + "test41", content: c, trigger: trig)
            try? await center.add(req)
            KalStore.shared.showToast("Testvarsel kommer om 5 s", undo: "")
            seq += 1
            let id: Int = seq
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            if UIApplication.shared.applicationState == .active && id == seq {
                withAnimation(.easeOut(duration: 0.25)) { banner = true }
                try? await Task.sleep(nanoseconds: 5_000_000_000)
                if id == seq { withAnimation(.easeOut(duration: 0.25)) { banner = false } }
            }
        }
    }

    func openSettings() {
        if let u = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(u) }
    }

    /// Lang-trykk: push via serveren (APNs/FCM).
    func pushTest() {
        KalHaptic.soft()
        pushText = "Sender push …"
        Task {
            let t0: Date = Date()
            var res: Data? = nil
            var err: String = ""
            do {
                res = try await KalNet.send("POST", "/api/kalender/notify/test", json: ["app": "kalender", "platform": "ios"], timeout: 15)
            } catch let e as KalNetError {
                if e.status == 404 || e.status == 405 {
                    do {
                        res = try await KalNet.send("POST", "/api/push/test", json: ["app": "kalender"], timeout: 15)
                    } catch let e2 as KalNetError {
                        err = e2.message
                    } catch {
                        err = error.localizedDescription
                    }
                } else {
                    err = e.message
                }
            } catch {
                err = error.localizedDescription
            }
            if res == nil {
                pushText = "Push feilet: " + (err.isEmpty ? "ukjent feil" : err)
                return
            }
            let o: [String: Any] = ((try? JSONSerialization.jsonObject(with: res ?? Data())) as? [String: Any]) ?? [:]
            if let e = o["error"] as? String, !e.isEmpty {
                pushText = "Push feilet: " + e
                return
            }
            var ms: Double = Date().timeIntervalSince(t0) * 1000
            if let m = o["ms"] as? Double { ms = m } else if let m = o["ms"] as? Int { ms = Double(m) }
            let sec: String = String(format: "%.1f", ms / 1000).replacingOccurrences(of: ".", with: ",")
            pushText = "Push sendt · kom fram på " + sec + " s"
        }
    }
}

/// Raden «Send testvarsel» (rødt bjelle-ikon) · «Kommer om 5 sekunder · lås skjermen for å se det» · «Test».
struct KalTestRow41: View {
    @Environment(\.kal) private var t
    @MainActor private var n: KalNotify41 { KalNotify41.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                Image(systemName: "bell").font(.system(size: 16, weight: .semibold)).foregroundStyle(Color.white)
                    .frame(width: 34, height: 34)
                    .background(RoundedRectangle(cornerRadius: 10).fill(t.red))
                VStack(alignment: .leading, spacing: 1) {
                    Text("Send testvarsel").font(KalFont.ui(14.5, .bold)).foregroundStyle(t.ink)
                    Text("Kommer om 5 sekunder · lås skjermen for å se det").font(KalFont.ui(12.5)).foregroundStyle(t.mut)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 4)
                Text("Test").font(KalFont.ui(13, .bold)).foregroundStyle(t.red)
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .background(RoundedRectangle(cornerRadius: 16).fill(t.card))
            .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(t.line, lineWidth: 1))
            .contentShape(RoundedRectangle(cornerRadius: 16))
            .onTapGesture { n.test() }
            .onLongPressGesture(minimumDuration: 0.6) { n.pushTest() }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isButton)
            .accessibilityHint("Lang-trykk sender push fra serveren")
            if n.denied {
                HStack(spacing: 10) {
                    Text("Varsler er slått av for Kalender").font(KalFont.ui(13, .semibold)).foregroundStyle(t.acc)
                    Spacer(minLength: 4)
                    KalPill(title: "Åpne Innstillinger", filled: false, height: 32) { n.openSettings() }
                }
            }
            if !n.pushText.isEmpty {
                Text(n.pushText).font(KalFont.ui(12.5)).foregroundStyle(t.mut)
            }
        }
    }
}

/// Banneret i appen når testvarselet kommer mens appen er åpen (ntBan i fasiten).
struct KalTestBanner41: View {
    var body: some View {
        VStack {
            HStack(alignment: .top, spacing: 12) {
                VStack(spacing: 0) {
                    Color(kalHex: "#b23a2a").frame(height: 11)
                    Text(String(KalD.dayOfMonth(Date()))).font(KalFont.serif(18)).foregroundStyle(Color(kalHex: "#1b1a17"))
                        .frame(maxHeight: .infinity)
                }
                .frame(width: 36, height: 36)
                .background(Color(kalHex: "#fffdf8"))
                .clipShape(RoundedRectangle(cornerRadius: 9))
                VStack(alignment: .leading, spacing: 1) {
                    HStack {
                        Text(KalNotify41.title).font(KalFont.ui(12, .bold)).foregroundStyle(Color(kalHex: "#1b1a17"))
                        Spacer()
                        Text("nå").font(KalFont.ui(12)).foregroundStyle(Color(kalHex: "#6b665c"))
                    }
                    Text("Tannlege kl. 17:30 · om 15 min").font(KalFont.ui(14, .bold)).foregroundStyle(Color(kalHex: "#1b1a17"))
                    Text("Varsler virker.").font(KalFont.ui(13)).foregroundStyle(Color(kalHex: "#3d3a33"))
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Color(kalHex: "#f5f0e6", opacity: 0.96)))
            .shadow(color: Color.black.opacity(0.3), radius: 20, y: 12)
            .padding(.horizontal, 10)
            .padding(.top, 6)
            .onTapGesture {
                withAnimation(.easeOut(duration: 0.2)) { KalNotify41.shared.banner = false }
            }
            Spacer(minLength: 0)
        }
        .transition(.move(edge: .top).combined(with: .opacity))
        .accessibilityElement(children: .combine)
    }
}
