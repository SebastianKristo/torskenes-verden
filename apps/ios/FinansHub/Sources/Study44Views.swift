import SwiftUI
import UIKit
import PhotosUI
import VisionKit
import UniformTypeIdentifiers

/* ---------------- Prompt 44: Studie → Dokumenter – opplasting, liste og valgt dokument ---------------- */

struct Study44Upload: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Study44 { Study44.shared }
    @State private var importing: Bool = false
    @State private var photo: PhotosPickerItem? = nil
    @State private var scanning: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Last opp vitnemål eller karakterutskrift").font(PF.serif(20, medium: true)).foregroundStyle(p.ink)
            Text("PDF, JPG, PNG eller HEIC. Glimt leser skole, dato, emner og karakterer, og regner ut snitt og studiepoeng.")
                .font(PF.ui(13)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 8) {
                button("Velg fil", "doc") { importing = true }
                PhotosPicker(selection: $photo, matching: .images) { label("Bilde", "photo") }
                if VNDocumentCameraViewController.isSupported { button("Ta bilde", "doc.viewfinder") { scanning = true } }
            }
            Study44Steps()
            if !m.error.isEmpty { Text(m.error).font(PF.ui(13)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true) }
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(p.line, style: StrokeStyle(lineWidth: 1.2, dash: [6, 5])))
        .fileImporter(isPresented: $importing, allowedContentTypes: [.pdf, .jpeg, .png, .heic, .image], allowsMultipleSelection: true) { (r: Result<[URL], Error>) in
            if case .success(let urls) = r { for u in urls { readFile(u) } }
        }
        .onChange(of: photo) { (_: PhotosPickerItem?, v: PhotosPickerItem?) in if let v { readPhoto(v) } }
        .fullScreenCover(isPresented: $scanning) {
            Study44Scanner { (pdf: Data?) in
                scanning = false
                if let pdf { m.upload(pdf, name: "Skannet dokument.pdf", mime: "application/pdf", store) }
            }
            .ignoresSafeArea()
        }
    }

    private func button(_ t: String, _ icon: String, _ act: @escaping () -> Void) -> some View {
        Button(action: act) { label(t, icon) }.buttonStyle(.plain)
    }

    private func label(_ t: String, _ icon: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon).font(.system(size: 13, weight: .semibold))
            Text(t).font(PF.ui(13.5, .bold))
        }
        .foregroundStyle(p.bg)
        .padding(.horizontal, 14).frame(minHeight: 44)
        .background(p.ink, in: Capsule())
        .contentShape(Capsule())
    }

    private func readFile(_ u: URL) {
        let ok: Bool = u.startAccessingSecurityScopedResource()
        defer { if ok { u.stopAccessingSecurityScopedResource() } }
        guard let d = try? Data(contentsOf: u) else { m.error = "Fikk ikke lest filen."; return }
        m.upload(d, name: u.lastPathComponent, mime: Study44Upload.mime(u.pathExtension), store)
    }

    static func mime(_ ext: String) -> String {
        switch ext.lowercased() {
        case "pdf": return "application/pdf"
        case "png": return "image/png"
        case "heic": return "image/heic"
        default: return "image/jpeg"
        }
    }

    private func readPhoto(_ item: PhotosPickerItem) {
        Task { @MainActor in
            guard let d = try? await item.loadTransferable(type: Data.self) else { return }
            let jpg: Data = UIImage(data: d)?.jpegData(compressionQuality: 0.9) ?? d
            m.upload(jpg, name: "Bilde.jpg", mime: "image/jpeg", store)
            photo = nil
        }
    }
}

/// Glimt-stegene med ekte tid (fra serveren) mens/etter opplasting.
struct Study44Steps: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Study44 { Study44.shared }

    var body: some View {
        if m.uploading || !m.steps.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Orb43(size: 18, busy: m.uploading)
                    Text(m.uploading ? "Glimt leser dokumentet …" : "Glimt er ferdig").font(PF.ui(13, .semibold)).foregroundStyle(p.ink)
                }
                ForEach(Array(m.steps.enumerated()), id: \.offset) { (pair: (offset: Int, element: String)) in
                    Text(pair.element).font(PF.mono(11, bold: false)).foregroundStyle(p.mut)
                }
            }
        }
    }
}

/// Dokumentskanneren (VisionKit) → én PDF med alle sidene.
struct Study44Scanner: UIViewControllerRepresentable {
    let done: (Data?) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(done: done) }

    func makeUIViewController(context: Context) -> VNDocumentCameraViewController {
        let vc: VNDocumentCameraViewController = VNDocumentCameraViewController()
        vc.delegate = context.coordinator
        return vc
    }

    func updateUIViewController(_ vc: VNDocumentCameraViewController, context: Context) {}

    final class Coordinator: NSObject, VNDocumentCameraViewControllerDelegate {
        let done: (Data?) -> Void
        init(done: @escaping (Data?) -> Void) { self.done = done }

        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
            let pages: [UIImage] = (0..<scan.pageCount).map { scan.imageOfPage(at: $0) }
            let bounds: CGRect = CGRect(x: 0, y: 0, width: 612, height: 792)
            let r: UIGraphicsPDFRenderer = UIGraphicsPDFRenderer(bounds: bounds)
            let pdf: Data = r.pdfData { (ctx: UIGraphicsPDFRendererContext) in
                for img in pages {
                    ctx.beginPage()
                    let s: CGFloat = Swift.min(bounds.width / img.size.width, bounds.height / img.size.height)
                    let w: CGFloat = img.size.width * s
                    let h: CGFloat = img.size.height * s
                    img.draw(in: CGRect(x: (bounds.width - w) / 2, y: (bounds.height - h) / 2, width: w, height: h))
                }
            }
            done(pdf)
        }

        func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) { done(nil) }

        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) { done(nil) }
    }
}

struct Study44DocList: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Study44 { Study44.shared }

    var body: some View {
        if !m.docs.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(m.docs) { (d: Study44Doc) in
                        Study44DocChip(d: d, on: m.selected?.id == d.id) { Haptics.shared.select(); m.selected = d; m.answer = "" }
                    }
                }
            }
        }
    }
}

struct Study44DocChip: View {
    @Environment(\.paper) private var p
    let d: Study44Doc
    let on: Bool
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            VStack(alignment: .leading, spacing: 2) {
                Text(d.kindLabel.uppercased()).font(PF.mono(9.5)).tracking(1).foregroundStyle(on ? p.bg.opacity(0.8) : p.lab)
                Text(d.title).font(PF.ui(13.5, .bold)).foregroundStyle(on ? p.bg : p.ink).lineLimit(1)
                Text([d.institution, d.date].filter { !$0.isEmpty }.joined(separator: " · ")).font(PF.ui(11.5)).foregroundStyle(on ? p.bg.opacity(0.8) : p.mut).lineLimit(1)
            }
            .padding(12).frame(width: 200, alignment: .leading)
            .background(on ? p.ink : p.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

/// Valgt dokument: sammendrag, emnetabell (KODE · EMNE · SP · KAR.), «Glimt fant», spørsmål, Legg emner i Studie, Slett.
struct Study44DocView: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Study44 { Study44.shared }
    let d: Study44Doc
    @State private var askDelete: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Study44DocHead(d: d)
            if !d.courses.isEmpty { Study44Table(courses: d.courses) }
            if !d.found.isEmpty { Study44Found(found: d.found) }
            Study44Ask()
            actions
        }
        .confirmationDialog("Slette «\(d.title)»?", isPresented: $askDelete, titleVisibility: .visible) {
            Button("Slett dokumentet", role: .destructive) { m.delete(store) }
            Button("Avbryt", role: .cancel) {}
        } message: {
            Text("Filen, teksten og alt Glimt fant slettes.")
        }
    }

    private var actions: some View {
        HStack(spacing: 8) {
            Button { m.apply(store) } label: {
                Text("Legg emner i Studie").font(PF.ui(14, .bold)).foregroundStyle(p.bg)
                    .frame(maxWidth: .infinity, minHeight: 46).background(p.ink, in: Capsule())
            }
            .buttonStyle(.plain)
            .disabled(d.courses.isEmpty)
            Button { askDelete = true } label: {
                Text("Slett").font(PF.ui(14, .bold)).foregroundStyle(p.lab)
                    .padding(.horizontal, 18).frame(minHeight: 46).overlay(Capsule().stroke(p.line, lineWidth: 1))
            }
            .buttonStyle(.plain)
        }
    }
}

struct Study44DocHead: View {
    @Environment(\.paper) private var p
    let d: Study44Doc

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(d.kindLabel.uppercased()).font(PF.mono(10)).tracking(1.2).foregroundStyle(p.lab)
            Text(d.title).font(PF.serif(24, medium: true)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
            Text([d.institution, d.program, d.date].filter { !$0.isEmpty }.joined(separator: " · ")).font(PF.ui(12.5)).foregroundStyle(p.mut)
            if !d.summary.isEmpty { Text(d.summary).font(PF.serif(16)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true) }
            if !d.compare.isEmpty { Text(d.compare).font(PF.ui(13, .semibold)).foregroundStyle(Color(hex: "#2f6b4a")) }
            HStack(spacing: 12) {
                if !d.snitt.isEmpty { Text("Snitt " + d.snitt).font(PF.ui(13.5, .bold)).foregroundStyle(p.ink) }
                if !d.spText.isEmpty { Text(d.spText).font(PF.ui(13.5, .bold)).foregroundStyle(p.ink) }
            }
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

struct Study44Table: View {
    @Environment(\.paper) private var p
    let courses: [Study44Course]

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Text("KODE").frame(width: 70, alignment: .leading)
                Text("EMNE").frame(maxWidth: .infinity, alignment: .leading)
                Text("SP").frame(width: 34, alignment: .trailing)
                Text("KAR.").frame(width: 40, alignment: .trailing)
            }
            .font(PF.mono(9.5)).foregroundStyle(p.mut)
            .padding(.horizontal, 12).padding(.vertical, 8)
            ForEach(courses) { (c: Study44Course) in
                Rectangle().fill(p.line).frame(height: 1)
                Study44CourseRow(c: c)
            }
        }
        .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

struct Study44CourseRow: View {
    @Environment(\.paper) private var p
    let c: Study44Course

    var body: some View {
        HStack(spacing: 8) {
            Text(c.kode).font(PF.mono(10.5, bold: false)).foregroundStyle(p.mut).frame(width: 70, alignment: .leading).lineLimit(1)
            Text(c.navn).font(PF.ui(13)).foregroundStyle(p.ink).frame(maxWidth: .infinity, alignment: .leading).lineLimit(2)
            Text(c.sp).font(PF.ui(12.5)).foregroundStyle(p.mut).frame(width: 34, alignment: .trailing)
            Text(c.karakter).font(PF.ui(14, .heavy)).foregroundStyle(Study44.toneColor(c.tone)).frame(width: 40, alignment: .trailing)
        }
        .padding(.horizontal, 12).frame(minHeight: 40)
    }
}

struct Study44Found: View {
    @Environment(\.paper) private var p
    let found: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("GLIMT FANT").font(PF.mono(10)).tracking(1.2).foregroundStyle(p.lab)
            ForEach(Array(found.enumerated()), id: \.offset) { (pair: (offset: Int, element: String)) in
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("✦").font(PF.ui(11)).foregroundStyle(p.lab)
                    Text(pair.element).font(PF.ui(13.5)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(14).frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

/// «hva er snittet i matte?», «har jeg strøk?» – svarer fra dokumentet.
struct Study44Ask: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Study44 { Study44.shared }
    @State private var q: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                TextField("Spør om dokumentet, f.eks. «har jeg strøk?»", text: $q)
                    .font(PF.ui(14.5)).foregroundStyle(p.ink)
                    .submitLabel(.search)
                    .onSubmit { m.ask(q, store) }
                    .padding(.leading, 14)
                Glimt43Pill(on: !q.isEmpty, height: 36, busy: m.asking) { m.ask(q, store) }
                    .padding(.trailing, 5)
            }
            .frame(height: 46)
            .background(p.card, in: Capsule())
            .overlay(Capsule().stroke(p.line, lineWidth: 1))
            if !m.answer.isEmpty {
                Text(m.answer).font(PF.ui(14)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                    .padding(12).frame(maxWidth: .infinity, alignment: .leading)
                    .background(p.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
        }
    }
}
