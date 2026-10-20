import SwiftUI
import UIKit

/* ---------------- Prompt 41: Kalender – eget bursdagsdesign i hendelsesarket ---------------- */
// Fasit: Kalender App.dc.html → R.dt.bd (vedlegg/kalender-bursdag-for.png er «før»). I stedet for tittelen: et kort i kalenderens
// farge (22 pt hjørner) med statisk konfetti, avatar 64 pt (bilde fra Bursdager, ellers initialer) med hvit ring og festhatt,
// «BURSDAG» / «BURSDAG I DAG», navnet (Newsreader 30), «Fyller 21 · Lørdag 14. november», til høyre «25 dager igjen».
// Knapper: Gratuler (Meldinger eller WhatsApp), Gaveidé (Huskeliste via Glimt), Bursdager › (Homelab → Bursdager).
// På bursdagsdagen: jenka-toget med Glimt og trompet langs bunnen av kortet.

@MainActor
@Observable
final class KalBdPeople41 {
    static let shared: KalBdPeople41 = KalBdPeople41()

    var people: [KalBdPerson41] = KalBdPeople41.loadCache()
    var images: [Int: UIImage] = [:]
    @ObservationIgnored private var loadedAt: Date = Date.distantPast
    @ObservationIgnored private var asked: Set<Int> = []

    private static func loadCache() -> [KalBdPerson41] {
        guard let d = UserDefaults.standard.data(forKey: "kal41.bdPeople") else { return [] }
        return (try? JSONDecoder().decode([KalBdPerson41].self, from: d)) ?? []
    }

    func refresh() {
        if Date().timeIntervalSince(loadedAt) < 300 { return }
        loadedAt = Date()
        Task {
            guard let d = try? await KalNet.get("/api/birthdays", timeout: 12) else { return }
            let list: [KalBdPerson41] = KalBd41.parsePeople(d)
            if list.isEmpty { return }
            people = list
            if let enc = try? JSONEncoder().encode(list) { UserDefaults.standard.set(enc, forKey: "kal41.bdPeople") }
        }
    }

    func person(_ name: String) -> KalBdPerson41? { KalBd41.match(name, in: people) }

    /// Bilde: avatarUrl / photoUrl, ellers første bilde fra GET /api/birthdays/:id/photos. Lastes med app-tokenet.
    func loadImage(_ p: KalBdPerson41) {
        if images[p.id] != nil || asked.contains(p.id) { return }
        asked.insert(p.id)
        Task {
            var url: String = !p.photo.isEmpty ? p.photo : p.avatarUrl
            if url.isEmpty, p.id > 0, let d = try? await KalNet.get("/api/birthdays/" + String(p.id) + "/photos", timeout: 10) {
                url = KalBd41.firstPhoto(d) ?? ""
            }
            if url.isEmpty { return }
            var data: Data? = nil
            if url.hasPrefix("/") {
                data = try? await KalNet.get(url, timeout: 15)
            } else if let u = URL(string: url) {
                data = try? await URLSession.shared.data(from: u).0
            }
            if let data, let img = UIImage(data: data) { images[p.id] = img }
        }
    }
}

struct KalBdCard41: View {
    @Environment(\.kal) private var t
    @Environment(\.accessibilityReduceMotion) private var reduce
    let e: KalEvent
    let color: Color

    var body: some View {
        let name: String = KalBd41.name(e.title)
        let p: KalBdPerson41? = KalBdPeople41.shared.person(name)
        let c: (kicker: String, big: String, unit: String) = KalBd41.counter(e.day)
        let today: Bool = e.day == KalD.todayKey()
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .center, spacing: 14) {
                KalBdAvatar41(name: name, person: p)
                VStack(alignment: .leading, spacing: 2) {
                    Text(c.kicker).font(KalFont.mono(10.5)).tracking(1.4).opacity(0.9)
                    Text(name).font(KalFont.serif(30)).lineLimit(2).minimumScaleFactor(0.7)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(KalBd41.sub(e.day, year: p?.year)).font(KalFont.ui(14)).opacity(0.92)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                VStack(alignment: .trailing, spacing: 0) {
                    Text(c.big).font(KalFont.serif(today ? 30 : 44, medium: false)).lineLimit(1).minimumScaleFactor(0.6)
                    if !c.unit.isEmpty { Text(c.unit).font(KalFont.ui(12.5)).opacity(0.9) }
                }
            }
            KalBdButtons41(name: name, day: e.day, person: p)
            if today { KalJenka41(reduce: reduce).frame(height: 30) }
        }
        .foregroundStyle(Color.white)
        .padding(18)
        .background(KalConfetti41(base: color))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .onAppear {
            KalBdPeople41.shared.refresh()
            if let p { KalBdPeople41.shared.loadImage(p) }
        }
        .accessibilityElement(children: .contain)
    }
}

/// Bakgrunnen: kalenderfargen + 16 faste konfettibiter.
struct KalConfetti41: View {
    let base: Color

    var body: some View {
        GeometryReader { (g: GeometryProxy) in
            ZStack(alignment: .topLeading) {
                base
                ForEach(KalBd41.confetti(), id: \.self) { (b: KalBd41.Bit) in
                    RoundedRectangle(cornerRadius: CGFloat(b.round ? b.w : 2))
                        .fill(Color(kalHex: KalBd41.confettiHex[b.color]))
                        .frame(width: CGFloat(b.w), height: CGFloat(b.h))
                        .rotationEffect(.degrees(b.angle))
                        .opacity(0.9)
                        .position(x: CGFloat(b.x) * g.size.width, y: CGFloat(b.y) * g.size.height)
                }
            }
        }
        .accessibilityHidden(true)
    }
}

struct KalBdAvatar41: View {
    let name: String
    let person: KalBdPerson41?

    var body: some View {
        let img: UIImage? = person.flatMap { (p: KalBdPerson41) -> UIImage? in KalBdPeople41.shared.images[p.id] }
        ZStack {
            Circle().fill(Color.white.opacity(0.22))
            if let img {
                Image(uiImage: img).resizable().scaledToFill().frame(width: 64, height: 64).clipShape(Circle())
            } else {
                Text(KalBd41.initials(name)).font(KalFont.ui(22, .heavy)).foregroundStyle(Color.white)
            }
        }
        .frame(width: 64, height: 64)
        .overlay(Circle().strokeBorder(Color.white.opacity(0.85), lineWidth: 3))
        .overlay(alignment: .topTrailing) {
            KalPartyHat41().frame(width: 30, height: 32).rotationEffect(.degrees(18)).offset(x: 8, y: -20)
        }
        .accessibilityHidden(true)
    }
}

/// Festhatten (viewBox 60×62): svart kjegle med gule striper og dusk.
struct KalPartyHat41: View {
    var body: some View {
        Canvas { (ctx: inout GraphicsContext, size: CGSize) in
            let sx: CGFloat = size.width / 60
            let sy: CGFloat = size.height / 62
            func pt(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x * sx, y: y * sy) }
            var cone: Path = Path()
            cone.move(to: pt(8, 56))
            cone.addLine(to: pt(30, 4))
            cone.addLine(to: pt(52, 56))
            cone.closeSubpath()
            ctx.fill(cone, with: .color(Color(kalHex: "#1b1a17")))
            var stripes: Path = Path()
            stripes.move(to: pt(14, 42)); stripes.addLine(to: pt(46, 42))
            stripes.move(to: pt(19, 30)); stripes.addLine(to: pt(41, 30))
            stripes.move(to: pt(24, 18)); stripes.addLine(to: pt(36, 18))
            ctx.stroke(stripes, with: .color(Color(kalHex: "#f2c14e")), lineWidth: 3 * sx)
            let r: CGFloat = 5 * sx
            ctx.fill(Path(ellipseIn: CGRect(x: 30 * sx - r, y: 4 * sy - r, width: 2 * r, height: 2 * r)), with: .color(Color(kalHex: "#f2c14e")))
        }
    }
}

struct KalBdButtons41: View {
    @MainActor private var s: KalStore { KalStore.shared }
    let name: String
    let day: String
    let person: KalBdPerson41?

    var body: some View {
        HStack(spacing: 8) {
            Button(action: { congratulate() }) {
                Text("Gratuler").font(KalFont.ui(13, .bold)).foregroundStyle(Color(kalHex: "#1b1a17"))
                    .frame(maxWidth: .infinity).frame(height: 40)
                    .background(Capsule().fill(Color.white))
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            light("Gaveidé") { gift() }
            light("Bursdager ›") { openBirthdays() }
        }
    }

    private func light(_ title: String, _ action: @escaping () -> Void) -> some View {
        Button(action: {
            KalHaptic.tap()
            action()
        }) {
            Text(title).font(KalFont.ui(13, .bold)).foregroundStyle(Color.white).lineLimit(1).minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity).frame(height: 40)
                .background(Capsule().fill(Color.white.opacity(0.2)))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private var firstName: String { String(name.split(separator: " ").first ?? Substring(name)) }

    /// Meldinger med «Gratulerer med dagen, Patryk!», eller WhatsApp når det er valgt i Bursdager.
    private func congratulate() {
        KalHaptic.tap()
        let text: String = "Gratulerer med dagen, " + firstName + "!"
        let body: String = text.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? text
        let phone: String = (person?.phone ?? "").filter { (c: Character) -> Bool in c.isNumber || c == "+" }
        let sms: URL? = URL(string: "sms:" + phone + "&body=" + body)
        if person?.via == "whatsapp" {
            let wa: String = phone.isEmpty ? "whatsapp://send?text=" + body : "https://wa.me/" + phone.replacingOccurrences(of: "+", with: "") + "?text=" + body
            if let url = URL(string: wa) {
                UIApplication.shared.open(url, options: [:]) { (ok: Bool) in
                    if !ok, let sms { UIApplication.shared.open(sms) }
                }
                return
            }
        }
        if let sms { UIApplication.shared.open(sms) }
    }

    /// «Kjøp gave til Patryk før 14. november» i Huskeliste via Glimt (i bakgrunnen).
    private func gift() {
        let d: Date = KalD.date(day)
        let q: String = "Kjøp gave til " + name + " før " + String(KalD.dayOfMonth(d)) + ". " + KalD.months[KalD.month(d) - 1]
        let who: String = name
        Task {
            do {
                _ = try await KalNet.send("POST", "/api/tasks/glimt", json: ["q": q, "async": true, "source": "kalender"], timeout: 15)
                s.showToast("Lagt til i Huskeliste · gave til " + who, undo: "")
            } catch let e as KalNetError {
                s.showToast(e.status == 404 ? "Huskeliste med Glimt finnes ikke på serveren ennå" : "Fikk ikke lagt til: " + e.message, undo: "")
            } catch {
                s.showToast("Fikk ikke lagt til gaveidéen", undo: "")
            }
        }
    }

    /// Homelab → Bursdager (personen), ellers en melding.
    private func openBirthdays() {
        let n: String = KalNet.enc(name)
        var path: String = "finanshub://bursdager?name=" + n
        if let id = person?.id, id > 0 { path += "&id=" + String(id) }
        if let u = URL(string: path), UIApplication.shared.canOpenURL(u) {
            UIApplication.shared.open(u)
        } else {
            s.showToast("Åpne Homelab → Bursdager for å se " + firstName, undo: "")
        }
    }
}

/// Jenka-toget: fem Glimt-stjerner som hopper i takt, med en trompet (noter) foran. «Reduser bevegelse»: står stille.
struct KalJenka41: View {
    let reduce: Bool

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: reduce)) { (ctx: TimelineViewDefaultContext) in
            KalJenkaFrame41(time: reduce ? 0 : ctx.date.timeIntervalSinceReferenceDate)
        }
        .accessibilityHidden(true)
    }
}

struct KalJenkaFrame41: View {
    let time: Double

    var body: some View {
        GeometryReader { (g: GeometryProxy) in
            let w: CGFloat = g.size.width
            let speed: Double = 38
            let span: Double = Double(w) + 160
            let head: Double = (time * speed).truncatingRemainder(dividingBy: span) - 80
            ZStack(alignment: .leading) {
                ForEach(0..<5, id: \.self) { (i: Int) in
                    let x: Double = head - Double(i) * 22
                    let hop: Double = abs(sin(time * 5 + Double(i) * 0.9)) * 6
                    KalStar()
                        .fill(LinearGradient(colors: [KalAnim.starTop, KalAnim.starBottom], startPoint: .top, endPoint: .bottom))
                        .frame(width: 16, height: 16)
                        .offset(x: CGFloat(x), y: CGFloat(8 - hop))
                }
                Image(systemName: "music.note")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(Color(kalHex: "#f2c14e"))
                    .offset(x: CGFloat(head + 22), y: CGFloat(2 - abs(sin(time * 3)) * 6))
            }
            .frame(width: w, height: g.size.height, alignment: .leading)
        }
    }
}

/// Tittel i liste-, dag-, uke- og månedsvisning: liten kake + navnet uten «har bursdag».
@MainActor
enum KalBdText41 {
    static func title(_ e: KalEvent, calName: String) -> Text {
        if KalBd41.isBirthday(e, calName: calName) {
            let n: String = KalBd41.name(e.title)
            let cake: Image = Image(systemName: "birthday.cake.fill")
            return Text("\(cake) \(n)")
        }
        return Text(e.title)
    }
}
