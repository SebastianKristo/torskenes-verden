import SwiftUI
import UIKit
import UserNotifications

@main
struct FinansHubApp: App {
    @State private var store = Store()
    @Environment(\.scenePhase) private var phase

    init() {
        // Prompt 51 (QA51): krasjrapporter – håndtererne først, forrige krasj legges i køen (FHCrash51.swift).
        Crash51.install()
        // Bakgrunnsoppgavene (helse og familie) må registreres før appen er ferdig startet.
        HealthSync.registerBackground()
        // Prompt 20: HealthKit vekker appen ved nye skritt og puls (enableBackgroundDelivery, hver time).
        HealthObserver20.shared.start()
        // Prompt 31: varselkategorier (Glimt-svar, prøveperioder) og bakgrunnshenting av /api/notify/pending (Notify31.swift).
        Notify31.setup()
        // Trykk på et varsel som starter appen: delegaten må være satt før appen er ferdig startet.
        UNUserNotificationCenter.current().delegate = NotifyDelegate.shared
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                // Prompt 38: fullskjermen «Logg inn på ny enhet» (må ligge innenfor .environment(store)).
                .qr38Host()
                // Prompt 41: «Logge inn i Kalender?» (homelab://app-auth og universal link /app-auth), AppAuth41.swift.
                .appAuth41Host()
                // Prompt 51: «Ny enhet vil logge inn», «Nytt i denne versjonen», feature flags og krasjkøen (FHSec51.swift).
                .fh51Host()
                // Prompt 51 (IOSPLAT51): offline-køen, Live Activities og Apple Watch-innloggingen (Plat51Host.swift).
                .plat51Host()
                .environment(store)
                // Prompt 38: homelab://login?c=… (QR-innlogging på ny enhet, QrLogin38.swift) før de vanlige dyplenkene.
                .onOpenURL { (u: URL) in
                    if AppAuth41.shared.handle(u, store) { return }
                    // Prompt 51 (IOSFEAT51): papir://join?i=…&c=…&srv=… – invitasjon for nye familiemedlemmer (Onboard51.swift).
                    if Onboard51.shared.handleURL(u, store) { return }
                    if Qr38Model.shared.handle(u, store) { return }
                    // Prompt 43: magnet:-lenker og homelab://magnet?url=… åpner «Legg til magnet-lenke» i Media.
                    if Media43.shared.handleURL(u, store) { return }
                    store.openDeepLink(u)
                }
                // Universal link https://<server>/l/<kode> (krever Associated Domains når det er satt opp).
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { (a: NSUserActivity) in
                    if let u = a.webpageURL {
                        if AppAuth41.shared.handle(u, store) { return }
                        if Onboard51.shared.handleURL(u, store) { return }
                        _ = Qr38Model.shared.handle(u, store)
                    }
                }
                .task {
                    // Prompt 42: Klassisk (Liquid Glass / Material) er slettet – flytt til Papir (Design42.swift).
                    store.migrateClassic42(server: false)
                    // Prompt 39: nytt standard app-ikon – valget i appen følger ikonet iOS viser (Settings39.swift).
                    Task { await AppMeta.sync39() }
                    if store.locked { store.unlock() }
                    if store.loggedIn { try? await store.reload() }
                    if store.loggedIn { await familyWake() }
                    // Prompt 38: Domener lastes på forhånd, så tallene står klare når siden åpnes (Nav38.swift).
                    if store.loggedIn { await store.dom38Preload() }
                }
        }
        .onChange(of: phase) { _, p in
            if p == .active && store.loggedIn { Task { await familyWake(); await store.dom38Preload() } }
        }
    }

    /// Familie: fortsett delingen (hvis den er på), send helsesammendraget og hent nye sonevarsler.
    @MainActor private func familyWake() async {
        // Bakgrunnsbildet: prøv igjen hvis det feilet, og «Vær nå» følger været.
        if store.photoFailed || store.photoImage == nil || store.photo == "weather" { await store.loadPhotoWindow() }
        FamilyLocation.shared.resume(store)
        HealthSync.schedule()
        await HealthSync.shared.syncNow(store.api)
        await FamilyModel.shared.pollEvents(store.api)
    }
}

/// Systemkameraet (bakkamera) for å ta bilde av kvitteringer.
struct CameraView: UIViewControllerRepresentable {
    /// Frontkamera (profilbilde).
    var front = false
    let done: (UIImage?) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let p = UIImagePickerController()
        p.sourceType = UIImagePickerController.isSourceTypeAvailable(.camera) ? .camera : .photoLibrary
        if p.sourceType == .camera { p.cameraDevice = front && UIImagePickerController.isCameraDeviceAvailable(.front) ? .front : .rear }
        p.delegate = context.coordinator
        return p
    }
    func updateUIViewController(_ vc: UIImagePickerController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraView
        init(_ p: CameraView) { parent = p }
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            parent.done(info[.originalImage] as? UIImage)
            parent.dismiss()
        }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.done(nil)
            parent.dismiss()
        }
    }
}
