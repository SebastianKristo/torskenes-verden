import SwiftUI
import UIKit
import PhotosUI

/* ---------------- Prompt 41: Bursdager – jenka-tog i toppkortet, bilder av personer, uten fanelinje ----------------
   Spesifikasjon: prompts/prompt-41-pakke/claude-code-bursdag-jenka-glimt.md og claude-code-bursdag-bilder.md. Fasit: Bursdager.dc.html
   (partyEl) og glimt-figurer.js.
   – Feiringen ligger INNE i det røde toppkortet når noen har bursdag i dag: konfetti over hele kortet bak teksten (gul, hvit, mint,
     lyseblå, fersken, lilla), jenka-toget langs bunnen (Glimt først med festhatt og trompet, så Stjerne, Gris, Ugle, Boble, Spire med
     festhatt), 11 s over kortet, hopp 0,42 s med vipp ±6°, noter ♪ ♫ fra trompeten. 78 pt bunnmarg og svak mørk gradient nederst.
     Redusert bevegelse: toget står stille midt i kortet, ingen konfetti. Feiring: Automatisk / Vis nå / Av (bd41_party).
   – Bilder: «Last opp bilde» / «Bytt bilde» / «Fjern bilde» (og «Bruk bildet fra Familie» når personen er koblet):
     POST /api/birthdays/:id/photo (multipart «file», kvadrat 256 px, JPEG 82 %) · DELETE /api/birthdays/:id/photo ·
     POST /api/birthdays/:id/photo {fromFamily:true}. Personer uten bilde får et lite «+» på avataren.
   – Bursdager-siden har ingen fanelinje og ingen skanneknapp (som Bibel og Gjøremål). Kalendere ligger bare i Innstillinger. */

extension Store {
    var inBirthdays41: Bool { paperClassic == nil && paperFin == nil && paperTab == "bursdag" }
}

@MainActor
@Observable
final class Bday41 {
    static let shared = Bday41()

    /// auto | pa (vis nå) | av
    var party: String = UserDefaults.standard.string(forKey: "bd41_party") ?? "auto" {
        didSet { UserDefaults.standard.set(party, forKey: "bd41_party") }
    }
    var busy: String? = nil
    /// Økes når feiringen skal starte på nytt (trykk på kortet).
    var restart: Int = 0

    func showParty(_ today: Bool) -> Bool {
        switch party {
        case "av": return false
        case "pa": return true
        default: return today
        }
    }

    func upload(_ b: Birthday24, _ img: UIImage, _ store: Store) {
        guard let jpeg = img.squared(256).jpegData(compressionQuality: 0.82) else { return }
        busy = b.id
        let enc: String = b.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? b.id
        Task { @MainActor in
            defer { self.busy = nil }
            do {
                let d: Data = try await store.api.upload("/birthdays/" + enc + "/photo", parts: [API.Part(name: "file", filename: "photo.jpg", mime: "image/jpeg", data: jpeg)], prefix: "/api")
                Haptics.shared.success()
                store.flash(JS.str(JS.obj(d), "toast") ?? ("Bilde lagt til for " + String(b.name.split(separator: " ").first ?? "")))
                await BirthdayModel24.shared.load(store)
            } catch let e as APIError {
                store.flash(e.status == 404 ? "Serveren støtter ikke bilder ennå. Oppdater Homelab." : e.message)
            } catch {
                store.flash(error.localizedDescription)
            }
        }
    }

    func fromFamily(_ b: Birthday24, _ store: Store) {
        busy = b.id
        let enc: String = b.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? b.id
        Task { @MainActor in
            defer { self.busy = nil }
            do {
                let d: Data = try await store.api.callAt("/api", "POST", "/birthdays/" + enc + "/photo", json: ["fromFamily": true], timeout: 20)
                Haptics.shared.success()
                store.flash(JS.str(JS.obj(d), "toast") ?? "Bildet fra Familie er lagt til")
                await BirthdayModel24.shared.load(store)
            } catch let e as APIError {
                store.flash(e.message)
            } catch {
                store.flash(error.localizedDescription)
            }
        }
    }

    func remove(_ b: Birthday24, _ store: Store) {
        Haptics.shared.warning()
        busy = b.id
        let enc: String = b.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? b.id
        Task { @MainActor in
            defer { self.busy = nil }
            _ = try? await store.api.callAt("/api", "DELETE", "/birthdays/" + enc + "/photo", timeout: 15)
            store.flash("Bildet er fjernet")
            await BirthdayModel24.shared.load(store)
        }
    }
}

/// «Last opp bilde» (kamera-ikon) øverst i detaljene, eller «Bytt bilde» / «Fjern bilde».
struct Bday41PhotoRow: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Bday41 { Bday41.shared }
    let b: Birthday24
    @State private var pick: PhotosPickerItem? = nil
    @State private var camera: Bool = false

    private var has: Bool { !b.photoUrl.isEmpty || b.avatarUrl.contains("/birthdays/") }

    var body: some View {
        Flow(spacing: 8) {
            PhotosPicker(selection: $pick, matching: .images) {
                label(has ? "Bytt bilde" : "Last opp bilde", icon: "photo")
            }
            .buttonStyle(.plain)
            Button { Haptics.shared.tap(); camera = true } label: { label("Ta bilde", icon: "camera") }
                .buttonStyle(.plain)
            if has {
                Button { m.remove(b, store) } label: { label("Fjern bilde", icon: "trash", color: p.lab) }
                    .buttonStyle(.plain)
            }
            if !b.personId.isEmpty {
                Button { m.fromFamily(b, store) } label: { label("Bruk bildet fra Familie", icon: "person.crop.circle") }
                    .buttonStyle(.plain)
            }
            if m.busy == b.id { ProgressView() }
        }
        .onChange(of: pick) { _, v in
            guard let v else { return }
            Task {
                if let d = try? await v.loadTransferable(type: Data.self), let img = UIImage(data: d) { m.upload(b, img, store) }
                pick = nil
            }
        }
        .fullScreenCover(isPresented: $camera) {
            CameraView(front: false) { (img: UIImage?) in
                if let img { m.upload(b, img, store) }
            }
            .ignoresSafeArea()
        }
    }

    private func label(_ t: String, icon: String, color: Color? = nil) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon).font(.system(size: 12, weight: .semibold))
            Text(t).font(PF.ui(12.5, .bold))
        }
        .foregroundStyle(color ?? p.ink)
        .padding(.horizontal, 12).frame(height: 32)
        .overlay(Capsule().stroke(p.line, lineWidth: 1))
        .contentShape(Capsule())
    }
}

/// Lite «+» nede til høyre på avataren til personer uten bilde.
struct Bday41PlusBadge: View {
    @Environment(\.paper) private var p

    var body: some View {
        Image(systemName: "plus").font(.system(size: 8, weight: .heavy)).foregroundStyle(p.ink)
            .frame(width: 16, height: 16)
            .background(p.card, in: Circle())
            .overlay(Circle().stroke(p.line, lineWidth: 1))
            .accessibilityHidden(true)
    }
}

/* ---------- Jenka-toget og konfetti i toppkortet ---------- */

struct Bday41Party: View {
    @Environment(\.accessibilityReduceMotion) private var reduce
    @MainActor private var m: Bday41 { Bday41.shared }
    @State private var start: Date = Date()

    static let confetti: [Color] = [Color(hex: "#f2c14e"), Color.white, Color(hex: "#9fe3c2"), Color(hex: "#a8d4ff"), Color(hex: "#ffc9a8"), Color(hex: "#c9b0ff")]
    static let followers: [String] = ["stjerne", "gris", "ugle", "boble", "spire"]

    var body: some View {
        GeometryReader { (g: GeometryProxy) in
            if reduce {
                train(width: g.size.width, height: g.size.height, t: 0, x: g.size.width * 0.5 - 160, still: true)
            } else {
                TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { (ctx: TimelineViewDefaultContext) in
                    let t: Double = ctx.date.timeIntervalSince(start)
                    ZStack(alignment: .topLeading) {
                        Canvas { (gc: inout GraphicsContext, size: CGSize) in Bday41Party.drawConfetti(&gc, size, t) }
                        let total: CGFloat = g.size.width + 360
                        let x: CGFloat = CGFloat((t.truncatingRemainder(dividingBy: 11)) / 11) * total - 340
                        train(width: g.size.width, height: g.size.height, t: t, x: x, still: false)
                    }
                }
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .onChange(of: m.restart) { _, _ in start = Date() }
    }

    /// Glimt først (50 pt, festhatt og trompet), så fem figurer (40 pt) med festhatt.
    private func train(width: CGFloat, height: CGFloat, t: Double, x: CGFloat, still: Bool) -> some View {
        let base: CGFloat = height - 8
        return ZStack(alignment: .topLeading) {
            ForEach(Array(Bday41Party.followers.enumerated()), id: \.offset) { i, id in
                let off: CGFloat = CGFloat(Bday41Party.followers.count - i) * 46
                Bday41Dancer(id: id, size: 40, t: t - Double(i + 1) * 0.12, still: still, trumpet: false)
                    .position(x: x + off - 20, y: base - 26)
            }
            Bday41Dancer(id: "glimt", size: 50, t: t, still: still, trumpet: true)
                .position(x: x + CGFloat(Bday41Party.followers.count + 1) * 46 + 4, y: base - 32)
        }
        .frame(width: width, height: height, alignment: .topLeading)
    }

    /// 30 biter (runde og firkantede) som faller og roterer.
    static func drawConfetti(_ gc: inout GraphicsContext, _ size: CGSize, _ t: Double) {
        for i in 0..<30 {
            let r1: Double = Glimt40Jul.rnd(i * 3 + 1)
            let r2: Double = Glimt40Jul.rnd(i * 3 + 2)
            let r3: Double = Glimt40Jul.rnd(i * 3 + 3)
            let speed: Double = 28 + r2 * 34
            let h: Double = Double(size.height) + 20
            let y: Double = (r1 * h + t * speed).truncatingRemainder(dividingBy: h) - 10
            let x: Double = r3 * Double(size.width) + sin(t * 1.3 + Double(i)) * 8
            let c: Color = confetti[i % confetti.count]
            let ang: Double = t * (1.5 + r2 * 2) + Double(i)
            var ctx: GraphicsContext = gc
            ctx.translateBy(x: x, y: y)
            ctx.rotate(by: .radians(ang))
            let rect: CGRect = CGRect(x: -3, y: -2, width: 6, height: 4)
            if i % 3 == 0 {
                ctx.fill(Path(ellipseIn: CGRect(x: -2.5, y: -2.5, width: 5, height: 5)), with: .color(c.opacity(0.9)))
            } else {
                ctx.fill(Path(rect), with: .color(c.opacity(0.9)))
            }
        }
    }
}

/// Én figur i toget: hopper 0,42 s med vipp ±6°, festhatt, og trompet med noter for Glimt.
struct Bday41Dancer: View {
    let id: String
    let size: CGFloat
    let t: Double
    let still: Bool
    let trumpet: Bool

    var body: some View {
        let phase: Double = still ? 0 : (t / 0.42).truncatingRemainder(dividingBy: 1)
        let hop: CGFloat = still ? 0 : CGFloat(abs(sin(phase * Double.pi))) * size * 0.16
        let tilt: Double = still ? 0 : sin(phase * 2 * Double.pi) * 6
        ZStack(alignment: .topLeading) {
            // Prompt 44: jenka-hoppet bærer både figuren og lua (figuren svever ikke for seg selv).
            Glimt35Fig(id: id, size: size, mood: .idle, t: Swift.max(0, t), still: still, noJul: true).glimt44Carried()
            Glimt40Party(S: size, t: Swift.max(0, t), still: still).offset(x: size * 0.5 - size * 0.22, y: -size * 0.48)
            if trumpet {
                Bday41Trumpet(size: size, t: t, still: still).offset(x: size * 0.82, y: size * 0.52)
            }
        }
        .frame(width: size, height: size * 1.1, alignment: .topLeading)
        .rotationEffect(.degrees(tilt))
        .offset(y: -hop)
    }
}

/// Gul trompet som vugger (0,5 s) og sender ut noter ♪ ♫ som flyter opp.
struct Bday41Trumpet: View {
    let size: CGFloat
    let t: Double
    let still: Bool

    var body: some View {
        let sway: Double = still ? 0 : sin(t * 2 * Double.pi / 0.5) * 5
        ZStack(alignment: .leading) {
            Path { (p: inout Path) in
                p.move(to: CGPoint(x: 0, y: size * 0.07))
                p.addLine(to: CGPoint(x: size * 0.42, y: size * 0.05))
                p.addLine(to: CGPoint(x: size * 0.56, y: -size * 0.04))
                p.addLine(to: CGPoint(x: size * 0.56, y: size * 0.22))
                p.addLine(to: CGPoint(x: size * 0.42, y: size * 0.12))
                p.addLine(to: CGPoint(x: 0, y: size * 0.11))
                p.closeSubpath()
            }
            .fill(Color(hex: "#f2c14e"))
            .shadow(color: Color.black.opacity(0.25), radius: 1, y: 1)
            if !still {
                ForEach(0..<3, id: \.self) { (i: Int) in
                    let ph: Double = ((t + Double(i) * 0.6) / 1.8).truncatingRemainder(dividingBy: 1)
                    Text(i % 2 == 0 ? "♪" : "♫").font(.system(size: size * 0.24, weight: .bold))
                        .foregroundStyle(Bday41Party.confetti[(i * 2) % Bday41Party.confetti.count])
                        .offset(x: size * (0.6 + 0.2 * ph), y: -size * (0.1 + 0.7 * ph))
                        .opacity(1 - ph)
                }
            }
        }
        .frame(width: size * 0.6, height: size * 0.3, alignment: .leading)
        .rotationEffect(.degrees(sway), anchor: .leading)
    }
}

/// «Feiring: Automatisk / Vis nå / Av» nederst på Bursdager-siden.
struct Bday41PartySetting: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Bday41 { Bday41.shared }

    var body: some View {
        HStack(spacing: 6) {
            Text("Feiring").font(PF.ui(13, .semibold)).foregroundStyle(p.mut)
            Spacer(minLength: 4)
            chip("auto", "Automatisk")
            chip("pa", "Vis nå")
            chip("av", "Av")
        }
        .padding(.horizontal, 4)
    }

    private func chip(_ k: String, _ n: String) -> some View {
        let on: Bool = m.party == k
        return Button { Haptics.shared.select(); m.party = k } label: {
            Text(n).font(PF.ui(12, .semibold)).foregroundStyle(on ? p.bg : p.ink)
                .padding(.horizontal, 10).frame(height: 28)
                .background(on ? p.ink : Color.clear, in: Capsule())
                .overlay(Capsule().stroke(on ? p.ink : p.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}
