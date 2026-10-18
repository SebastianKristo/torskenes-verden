import SwiftUI
import UIKit

@main
struct FinansHubApp: App {
    @State private var store = Store()
    @Environment(\.scenePhase) private var phase

    init() {
        // Bakgrunnsoppgavene (helse og familie) må registreres før appen er ferdig startet.
        HealthSync.registerBackground()
        // Prompt 20: HealthKit vekker appen ved nye skritt og puls (enableBackgroundDelivery, hver time).
        HealthObserver20.shared.start()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .onOpenURL { store.openDeepLink($0) }
                .task {
                    if store.locked { store.unlock() }
                    if store.loggedIn { try? await store.reload() }
                    if store.loggedIn { await familyWake() }
                }
        }
        .onChange(of: phase) { _, p in
            if p == .active && store.loggedIn { Task { await familyWake() } }
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
