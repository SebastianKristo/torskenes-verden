import SwiftUI
import UIKit
import VisionKit

/* ---------------- Papir → Sporing: «Ny sending» (den flytende knappen på Sporing) ---------------- */

/// Felt for sporingsnummer (tastaturet åpnes med en gang), transportøren gjenkjennes mens man skriver,
/// «Spor sending», «Skann strekkode» (kamera) og «Lim inn».
struct PaperNewShipmentSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.dismiss) private var dismiss
    @State private var no = ""
    @State private var scanning = false
    @FocusState private var focused: Bool

    var body: some View {
        let clean = no.replacingOccurrences(of: " ", with: "").uppercased()
        let car = Carrier.detect(clean)
        let name = Carrier.known.first { $0.id == car }?.name
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text("Ny sending").font(PF.serif(24, medium: true)).foregroundStyle(p.ink)
                Spacer()
                Text("✦ Transportør gjenkjennes").font(PF.ui(12.5)).foregroundStyle(p.mut)
            }
            TextField("Sporingsnummer", text: $no)
                .font(PF.mono(16)).foregroundStyle(p.ink)
                .textInputAutocapitalization(.characters).autocorrectionDisabled()
                .submitLabel(.done)
                .focused($focused)
                .onSubmit(add)
                .padding(.horizontal, 16).frame(height: 50)
                .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(p.line, lineWidth: 1))
            if clean.count >= 6, let name, car != "other" {
                Text("✓ \(name) gjenkjent").font(PF.ui(13, .semibold)).foregroundStyle(p.pos)
            }
            PInkButton(title: "Spor sending", height: 50, full: true, act: add)
                .disabled(clean.count < 6)
                .opacity(clean.count < 6 ? 0.5 : 1)
            HStack(spacing: 8) {
                if PaperBarcodeScanner.available {
                    PLineButton(title: "Skann strekkode", height: 50, full: true) { scanning = true }
                }
                PLineButton(title: "Lim inn", height: 50, full: true) {
                    if let s = UIPasteboard.general.string?.trimmingCharacters(in: .whitespacesAndNewlines), !s.isEmpty { no = s }
                }
            }
            Text("Sendinger fra e-post og Finn legges til automatisk.").font(PF.ui(12.5)).foregroundStyle(p.mut)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 18).padding(.top, 22).padding(.bottom, 10)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(p.bg)
        .environment(\.colorScheme, p.dark ? .dark : .light)
        .onAppear {
            Task {
                try? await Task.sleep(for: .milliseconds(350))
                focused = true
            }
        }
        .fullScreenCover(isPresented: $scanning) {
            PaperBarcodeScanner { code in
                no = code
                scanning = false
            } close: {
                scanning = false
            }
            .ignoresSafeArea()
        }
    }

    private func add() {
        let n = no.replacingOccurrences(of: " ", with: "").uppercased()
        guard n.count >= 6 else { return }
        let car = Carrier.detect(n)
        store.addTracking(no: n, name: "", carrier: car == "other" ? nil : car, out: false)
        Haptics.shared.success()
        dismiss()
    }
}

/// Strekkode/QR med kameraet (VisionKit). Skjules når enheten ikke støtter det.
struct PaperBarcodeScanner: UIViewControllerRepresentable {
    let found: (String) -> Void
    let close: () -> Void

    static var available: Bool { DataScannerViewController.isSupported && DataScannerViewController.isAvailable }

    func makeCoordinator() -> Coordinator { Coordinator(found: found) }

    func makeUIViewController(context: Context) -> UINavigationController {
        let vc = DataScannerViewController(recognizedDataTypes: [.barcode()], qualityLevel: .balanced, recognizesMultipleItems: false,
                                           isHighFrameRateTrackingEnabled: false, isHighlightingEnabled: true)
        vc.delegate = context.coordinator
        vc.navigationItem.leftBarButtonItem = UIBarButtonItem(title: "Avbryt", style: .plain, target: context.coordinator, action: #selector(Coordinator.cancel))
        vc.title = "Skann strekkode"
        context.coordinator.onClose = close
        try? vc.startScanning()
        return UINavigationController(rootViewController: vc)
    }

    func updateUIViewController(_ vc: UINavigationController, context: Context) {}

    @MainActor final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let found: (String) -> Void
        var onClose: (() -> Void)?
        private var done = false

        init(found: @escaping (String) -> Void) { self.found = found }

        @objc func cancel() { onClose?() }

        func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            for item in addedItems { take(item) }
        }

        func dataScanner(_ dataScanner: DataScannerViewController, didTapOn item: RecognizedItem) { take(item) }

        private func take(_ item: RecognizedItem) {
            guard !done else { return }
            if case .barcode(let b) = item, let s = b.payloadStringValue, !s.isEmpty {
                done = true
                Haptics.shared.success()
                found(s.trimmingCharacters(in: .whitespacesAndNewlines))
            }
        }
    }
}
