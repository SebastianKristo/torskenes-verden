import SwiftUI
import UIKit
import PhotosUI

/* ---------------- Prompt 76 (SKJIOS): skap-oppsett ----------------
 Navn, rader, kolonner og type (kjøpt / 3D-print). Last opp eller ta bilde av skapet og dra de 4 hjørnehåndtakene til
 hjørnene på skapet, med rutenettet forhåndsvist i perspektiv (samme homografi som på Skjold Lab-siden).
 «Tilleggsskap (3D-print)» foreslår 12 rader × 4 skuffer (27 cm hylleplass, skuffer à ca. 60 mm, se tools/skjoldlab3d).
 Sletting nektes (409) når skapet har deler: velg da å flytte dem til et annet skap eller la dem stå uten plass. */

struct Skj76Setup: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Skjold76 { Skjold76.shared }
    let startId: String
    @State private var cabId: String = ""
    @State private var name: String = ""
    @State private var rows: Int = 12
    @State private var cols: Int = 5
    @State private var kind: String = "kjøpt"
    @State private var busy: Bool = false
    @State private var confirm: Bool = false
    @State private var blocked: Bool = false

    private var isNew: Bool { cabId == "ny" || cabId.isEmpty }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Skj76SheetTop(kicker: "Skap-oppsett", title: isNew ? "Nytt skap" : (name.isEmpty ? "Skap" : name))
                chooser
                fields
                Skj76Button(title: busy ? "Lagrer …" : (isNew ? "Opprett skapet" : "Lagre"), icon: "checkmark", filled: true) { save() }
                    .disabled(busy || name.trimmingCharacters(in: .whitespaces).isEmpty)
                if let c = m.cabinets.first(where: { $0.id == cabId }) {
                    Skj76PhotoSetup(cab: c)
                    Skj76Button(title: "Slett skapet", icon: "trash", danger: true) { confirm = true }
                }
            }
            .padding(16)
        }
        .background(p.bg.ignoresSafeArea())
        .onAppear { pick(startId) }
        .confirmationDialog("Slette skapet «" + name + "»?", isPresented: $confirm, titleVisibility: .visible) {
            Button("Slett", role: .destructive) { remove(nil) }
            Button("Avbryt", role: .cancel) {}
        }
        .confirmationDialog("Skapet har deler", isPresented: $blocked, titleVisibility: .visible) {
            ForEach(m.cabinets.filter { $0.id != cabId }) { (c: Skj76Cabinet) in
                Button("Flytt delene til " + c.name) { remove(c.id) }
            }
            Button("La delene stå uten plass", role: .destructive) { remove("none") }
            Button("Avbryt", role: .cancel) {}
        } message: {
            Text("Velg hva som skal skje med delene før skapet slettes.")
        }
    }

    private var chooser: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(m.cabinets) { (c: Skj76Cabinet) in chip(c.name, c.id) }
                chip("+ Nytt skap", "ny")
            }
        }
    }

    private func chip(_ t: String, _ id: String) -> some View {
        let on: Bool = cabId == id
        return Button { pick(id) } label: {
            Text(t).font(PF.ui(13, .semibold)).foregroundStyle(on ? p.bg : p.ink).lineLimit(1)
                .padding(.horizontal, 12).frame(height: 32)
                .background(on ? p.ink : Color.clear, in: Capsule())
                .overlay(Capsule().stroke(on ? Color.clear : p.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private var fields: some View {
        PCard {
            VStack(alignment: .leading, spacing: 10) {
                Skj76Field(label: "Navn", text: $name)
                Stepper("Rader: \(rows)", value: $rows, in: 1...40).font(PF.ui(14.5)).foregroundStyle(p.ink)
                Stepper("Skuffer per rad: \(cols)", value: $cols, in: 1...20).font(PF.ui(14.5)).foregroundStyle(p.ink)
                Picker("Type", selection: $kind) {
                    Text("Kjøpt").tag("kjøpt")
                    Text("3D-print").tag("3d")
                }
                .pickerStyle(.segmented)
                if isNew {
                    Skj76Button(title: "Tilleggsskap (3D-print), 27 cm", icon: "cube") { extra() }
                    Text("27 cm hylleplass gir 4 skuffer à ca. 60 mm og samme 12 rader som hovedskapet. Mål ditt eget skap først.")
                        .font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    /// Forslag fra 3D-delen (tools/skjoldlab3d): 270 mm bredde → 4 kolonner, samme radavstand som hovedskapet (12 rader).
    private func extra() {
        name = "Tilleggsskap (3D-print)"
        kind = "3d"
        rows = m.cabinets.first { $0.kind != "3d" }?.rows ?? 12
        cols = Skj76Setup.colsFor(widthMm: 270)
    }

    /// Kolonner fra bredden: skuff ~60 mm + 2 × 2 mm vegg og 2 × 3 mm sider.
    static func colsFor(widthMm: Double) -> Int { Swift.max(1, Int((widthMm - 6) / 64)) }

    private func pick(_ id: String) {
        if let c = m.cabinets.first(where: { $0.id == id }) ?? (id.isEmpty ? m.cabinet : nil) {
            cabId = c.id
            name = c.name
            rows = c.rows
            cols = c.cols
            kind = c.kind
        } else {
            cabId = "ny"
            name = ""
            rows = 12
            cols = 5
            kind = "kjøpt"
        }
    }

    private func save() {
        busy = true
        let body: [String: Any] = ["name": name.trimmingCharacters(in: .whitespaces), "rows": rows, "cols": cols, "kind": kind]
        let new: Bool = isNew
        let path: String = Skjold76.root + "/cabinets" + (new ? "" : "/\(cabId)")
        Task { @MainActor in
            defer { busy = false }
            do {
                let d: Data = try await store.api.callAt(Skjold76.prefix, new ? "POST" : "PATCH", path, json: body, timeout: 15)
                let o: [String: Any] = JS.obj(d)
                let id: String = JS.str(JS.dict(o, "cabinet") ?? o, "id") ?? cabId
                Haptics.shared.success()
                m.flash(new ? "Skapet er opprettet" : "Skapet er lagret")
                await m.loadCabinets(store)
                await m.loadMap(id, store)
                m.cabinetId = id
                pick(id)
            } catch { m.fail(error) }
        }
    }

    /// DELETE /cabinets/:id, med ?move=<id|none> etter 409.
    private func remove(_ move: String?) {
        let q: String = move.map { "?move=" + Skjold76.enc($0) } ?? ""
        let id: String = cabId
        Task { @MainActor in
            do {
                _ = try await store.api.callAt(Skjold76.prefix, "DELETE", Skjold76.root + "/cabinets/\(id)" + q, timeout: 15)
                Haptics.shared.warning()
                m.flash("Skapet er slettet")
                await m.refresh(store)
                pick("")
            } catch let e as APIError where e.status == 409 {
                blocked = true
            } catch { m.fail(error) }
        }
    }
}

/// Bildet av skapet: last opp/ta bilde, dra hjørnene, forhåndsvis rutenettet og lagre.
struct Skj76PhotoSetup: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Skjold76 { Skjold76.shared }
    let cab: Skj76Cabinet
    @State private var img: UIImage? = nil
    @State private var corners: [CGPoint] = Skj76PhotoSetup.start
    @State private var pickItem: PhotosPickerItem? = nil
    @State private var camera: Bool = false
    @State private var busy: Bool = false

    static let start: [CGPoint] = [CGPoint(x: 0.12, y: 0.08), CGPoint(x: 0.88, y: 0.08), CGPoint(x: 0.88, y: 0.92), CGPoint(x: 0.12, y: 0.92)]

    var body: some View {
        PCard {
            VStack(alignment: .leading, spacing: 10) {
                PLabel(text: "Bilde av skapet")
                if let img {
                    Skj76CornerEditor(img: img, rows: cab.rows, cols: cab.cols, corners: $corners)
                    Text("Dra de fire håndtakene til hjørnene på skapet. Rutenettet viser skuffene.").font(PF.ui(12.5)).foregroundStyle(p.mut)
                    HStack(spacing: 8) {
                        Skj76Button(title: "Lagre hjørner", icon: "checkmark", filled: true) { saveCorners() }
                        Skj76Button(title: "Fjern bilde", icon: "trash", danger: true) { removePhoto() }
                    }
                } else if !cab.photoUrl.isEmpty {
                    ProgressView().frame(maxWidth: .infinity).padding(20)
                }
                HStack(spacing: 8) {
                    Skj76Button(title: "Ta bilde", icon: "camera") { camera = true }
                    PhotosPicker(selection: $pickItem, matching: .images) {
                        Label("Velg bilde", systemImage: "photo").font(PF.ui(14, .bold)).foregroundStyle(p.ink)
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(p.line, lineWidth: 1))
                    }
                }
                if busy { ProgressView().frame(maxWidth: .infinity) }
            }
        }
        .task(id: cab.id + cab.photoUrl) { await boot() }
        .onChange(of: pickItem) { (_: PhotosPickerItem?, v: PhotosPickerItem?) in take(v) }
        .fullScreenCover(isPresented: $camera) {
            CameraView { (i: UIImage?) in if let i { upload(i) } }.ignoresSafeArea()
        }
    }

    private func boot() async {
        corners = cab.corners.count == 4 ? cab.corners : Skj76PhotoSetup.start
        img = await Skj76Images.shared.load(cab.photoUrl, store)
    }

    private func take(_ it: PhotosPickerItem?) {
        guard let it else { return }
        Task { @MainActor in
            if let d = try? await it.loadTransferable(type: Data.self), let i = UIImage(data: d) { upload(i) }
            pickItem = nil
        }
    }

    private func upload(_ i: UIImage) {
        guard let data = Skjold76.jpeg(i) else { return }
        busy = true
        Task { @MainActor in
            defer { busy = false }
            do {
                let part: API.Part = API.Part(name: "file", filename: "skap.jpg", mime: "image/jpeg", data: data)
                _ = try await store.api.upload(Skjold76.root + "/cabinets/\(cab.id)/photo", parts: [part], prefix: Skjold76.prefix, timeout: 90)
                Skj76Images.shared.forget(cab.photoUrl)
                img = i
                corners = Skj76PhotoSetup.start
                Haptics.shared.success()
                m.flash("Bildet er lastet opp. Dra hjørnene på plass.")
                await m.loadCabinets(store)
            } catch { m.fail(error) }
        }
    }

    private func saveCorners() {
        let keys: [String] = ["tl", "tr", "br", "bl"]
        var b: [String: Any] = [:]
        for (i, k) in keys.enumerated() {
            b[k] = ["x": Double(corners[i].x), "y": Double(corners[i].y)]
        }
        let body: [String: Any] = b
        Task { @MainActor in
            do {
                _ = try await store.api.callAt(Skjold76.prefix, "PUT", Skjold76.root + "/cabinets/\(cab.id)/corners", json: body, timeout: 15)
                Haptics.shared.success()
                m.flash("Hjørnene er lagret")
                m.photoMode = true
                await m.loadCabinets(store)
            } catch { m.fail(error) }
        }
    }

    private func removePhoto() {
        Task { @MainActor in
            do {
                _ = try await store.api.callAt(Skjold76.prefix, "DELETE", Skjold76.root + "/cabinets/\(cab.id)/photo", timeout: 15)
                Skj76Images.shared.forget(cab.photoUrl)
                img = nil
                m.photoMode = false
                await m.loadCabinets(store)
            } catch { m.fail(error) }
        }
    }
}

/// Bildet med 4 dragbare hjørner og rutenettet i perspektiv.
struct Skj76CornerEditor: View {
    @Environment(\.paper) private var p
    let img: UIImage
    let rows: Int
    let cols: Int
    @Binding var corners: [CGPoint]

    var body: some View {
        let ratio: CGFloat = img.size.height > 0 ? img.size.width / img.size.height : 1
        GeometryReader { (g: GeometryProxy) in
            let s: CGSize = g.size
            ZStack(alignment: .topLeading) {
                Image(uiImage: img).resizable().frame(width: s.width, height: s.height)
                Skj76GridOverlay(rows: rows, cols: cols, mark: nil, pulse: 0)
                    .frame(width: s.width, height: s.height)
                    .projectionEffect(projection(s))
                    .allowsHitTesting(false)
                outline(s)
                ForEach(0..<4, id: \.self) { (i: Int) in handle(i, s) }
            }
            .coordinateSpace(name: "skj76corners")
        }
        .aspectRatio(ratio, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func pts(_ s: CGSize) -> [CGPoint] { corners.map { CGPoint(x: $0.x * s.width, y: $0.y * s.height) } }

    private func projection(_ s: CGSize) -> ProjectionTransform {
        guard s.width > 0, s.height > 0, let h = Skj76Homography.square(to: pts(s)) else { return ProjectionTransform() }
        return h.projection(s.width, s.height)
    }

    private func outline(_ s: CGSize) -> some View {
        let q: [CGPoint] = pts(s)
        return Path { (path: inout Path) in
            guard q.count == 4 else { return }
            path.move(to: q[0])
            for i in 1..<4 { path.addLine(to: q[i]) }
            path.closeSubpath()
        }
        .stroke(p.lab, lineWidth: 2)
        .allowsHitTesting(false)
    }

    private func handle(_ i: Int, _ s: CGSize) -> some View {
        let pt: CGPoint = i < corners.count ? CGPoint(x: corners[i].x * s.width, y: corners[i].y * s.height) : .zero
        return Circle().fill(p.lab.opacity(0.35))
            .overlay(Circle().stroke(Color.white, lineWidth: 2))
            .frame(width: 34, height: 34)
            .contentShape(Circle())
            .position(pt)
            .gesture(
                DragGesture(minimumDistance: 0, coordinateSpace: .named("skj76corners"))
                    .onChanged { (v: DragGesture.Value) in move(i, v.location, s) }
            )
            .accessibilityLabel(["Øvre venstre", "Øvre høyre", "Nedre høyre", "Nedre venstre"][i] + " hjørne")
    }

    private func move(_ i: Int, _ loc: CGPoint, _ s: CGSize) {
        guard s.width > 0, s.height > 0, i < corners.count else { return }
        let x: CGFloat = Swift.min(1, Swift.max(0, loc.x / s.width))
        let y: CGFloat = Swift.min(1, Swift.max(0, loc.y / s.height))
        corners[i] = CGPoint(x: x, y: y)
    }
}
