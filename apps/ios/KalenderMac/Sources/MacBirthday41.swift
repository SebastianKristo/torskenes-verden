import SwiftUI
import AppKit

/* ---------------- Prompt 41: Kalender for Mac (native) – bursdagskort, kake i lister og søk med Glimt (Ollama) ---------------- */
// Samme mønster som iPhone (Kalender/Sources/KalBirthday41.swift, KalSearch41.swift) og fasiten Kalender App.dc.html (R.dt.bd, sAi).
// Logikken er delt i SharedKal/Core (KalBd41, KalAi41). macOS 13: ObservableObject (ikke @Observable).
// Ingen oppdateringsløkker: modellene endres bare fra knapper og ferdige nettkall, aldri under tegning; ingen scene/kommando-tilstand.

@MainActor
final class MacBdPeople41: ObservableObject {
    static let shared: MacBdPeople41 = MacBdPeople41()

    @Published private(set) var people: [KalBdPerson41] = MacBdPeople41.loadCache()
    @Published private(set) var images: [Int: NSImage] = [:]
    private var loadedAt: Date = Date.distantPast
    private var asked: Set<Int> = []

    private static func loadCache() -> [KalBdPerson41] {
        guard let d = UserDefaults.standard.data(forKey: "mac41.bdPeople") else { return [] }
        return (try? JSONDecoder().decode([KalBdPerson41].self, from: d)) ?? []
    }

    func refresh() {
        if Date().timeIntervalSince(loadedAt) < 300 { return }
        loadedAt = Date()
        Task {
            guard let d = try? await KalNet.get("/api/birthdays", timeout: 12) else { return }
            let list: [KalBdPerson41] = KalBd41.parsePeople(d)
            if list.isEmpty || list == self.people { return }
            self.people = list
            if let enc = try? JSONEncoder().encode(list) { UserDefaults.standard.set(enc, forKey: "mac41.bdPeople") }
        }
    }

    func person(_ name: String) -> KalBdPerson41? { KalBd41.match(name, in: people) }

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
            if let data, let img = NSImage(data: data) { self.images[p.id] = img }
        }
    }
}

/// Tittel i lister, uke/dag og måned: liten kake + navnet uten «har bursdag».
@MainActor
enum MacBdText41 {
    static func title(_ e: KalEvent, calName: String) -> Text {
        if KalBd41.isBirthday(e, calName: calName) {
            let n: String = KalBd41.name(e.title)
            let cake: Image = Image(systemName: "birthday.cake.fill")
            return Text("\(cake) \(n)")
        }
        return Text(e.title)
    }
}

/* ---------- Kortet i detaljvisningen ---------- */

struct MacBdCard41: View {
    @Environment(\.accessibilityReduceMotion) private var reduce
    @ObservedObject var people: MacBdPeople41 = MacBdPeople41.shared
    let e: KalEvent
    let color: Color

    var body: some View {
        let name: String = KalBd41.name(e.title)
        let p: KalBdPerson41? = people.person(name)
        let c: (kicker: String, big: String, unit: String) = KalBd41.counter(e.day)
        let today: Bool = e.day == KalD.todayKey()
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .center, spacing: 14) {
                MacBdAvatar41(name: name, image: p.flatMap { (x: KalBdPerson41) -> NSImage? in people.images[x.id] })
                VStack(alignment: .leading, spacing: 2) {
                    Text(c.kicker).font(MacFont.mono(10.5)).tracking(1.4).opacity(0.9)
                    Text(name).font(MacFont.serif(30)).lineLimit(2).fixedSize(horizontal: false, vertical: true)
                    Text(KalBd41.sub(e.day, year: p?.year)).font(MacFont.ui(14)).opacity(0.92)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                VStack(alignment: .trailing, spacing: 0) {
                    Text(c.big).font(MacFont.serif(today ? 30 : 44, medium: false)).lineLimit(1)
                    if !c.unit.isEmpty { Text(c.unit).font(MacFont.ui(12.5)).opacity(0.9) }
                }
            }
            MacBdButtons41(name: name, day: e.day, person: p)
            if today { MacJenka41(reduce: reduce).frame(height: 30) }
        }
        .foregroundColor(Color.white)
        .padding(18)
        .background(MacConfetti41(base: color))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .onAppear {
            people.refresh()
            if let p { people.loadImage(p) }
        }
    }
}

struct MacConfetti41: View {
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

struct MacBdAvatar41: View {
    let name: String
    let image: NSImage?

    var body: some View {
        ZStack {
            Circle().fill(Color.white.opacity(0.22))
            if let image {
                Image(nsImage: image).resizable().scaledToFill().frame(width: 64, height: 64).clipShape(Circle())
            } else {
                Text(KalBd41.initials(name)).font(MacFont.ui(22, .heavy)).foregroundColor(Color.white)
            }
        }
        .frame(width: 64, height: 64)
        .overlay(Circle().strokeBorder(Color.white.opacity(0.85), lineWidth: 3))
        .overlay(alignment: .topTrailing) {
            MacPartyHat41().frame(width: 30, height: 32).rotationEffect(.degrees(18)).offset(x: 8, y: -20)
        }
        .accessibilityHidden(true)
    }
}

struct MacPartyHat41: View {
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
            stripes.move(to: pt(14, 42))
            stripes.addLine(to: pt(46, 42))
            stripes.move(to: pt(19, 30))
            stripes.addLine(to: pt(41, 30))
            stripes.move(to: pt(24, 18))
            stripes.addLine(to: pt(36, 18))
            ctx.stroke(stripes, with: .color(Color(kalHex: "#f2c14e")), lineWidth: 3 * sx)
            let r: CGFloat = 5 * sx
            ctx.fill(Path(ellipseIn: CGRect(x: 30 * sx - r, y: 4 * sy - r, width: 2 * r, height: 2 * r)), with: .color(Color(kalHex: "#f2c14e")))
        }
    }
}

struct MacBdButtons41: View {
    let name: String
    let day: String
    let person: KalBdPerson41?

    var body: some View {
        HStack(spacing: 8) {
            Button(action: { congratulate() }) {
                Text("Gratuler").font(MacFont.ui(13, .bold)).foregroundColor(Color(kalHex: "#1b1a17"))
                    .frame(maxWidth: .infinity).frame(height: 36)
                    .background(Capsule().fill(Color.white))
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            light("Gaveidé") { gift() }
            light("Bursdager ›") { openBirthdays() }
        }
    }

    private func light(_ title: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(MacFont.ui(13, .bold)).foregroundColor(Color.white).lineLimit(1)
                .frame(maxWidth: .infinity).frame(height: 36)
                .background(Capsule().fill(Color.white.opacity(0.2)))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private var firstName: String { String(name.split(separator: " ").first ?? Substring(name)) }

    /// Meldinger (sms:) med «Gratulerer med dagen, Patryk!», eller WhatsApp når det er valgt i Bursdager.
    private func congratulate() {
        let text: String = "Gratulerer med dagen, " + firstName + "!"
        let body: String = text.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? text
        let phone: String = (person?.phone ?? "").filter { (c: Character) -> Bool in c.isNumber || c == "+" }
        if person?.via == "whatsapp" {
            let wa: String = "https://wa.me/" + phone.replacingOccurrences(of: "+", with: "") + "?text=" + body
            if let u = URL(string: wa), NSWorkspace.shared.open(u) { return }
        }
        if let u = URL(string: "sms:" + phone + "&body=" + body), NSWorkspace.shared.open(u) { return }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
        MacStore.shared.showToast("Hilsenen er kopiert: «" + text + "»", undo: "")
    }

    private func gift() {
        let d: Date = KalD.date(day)
        let q: String = "Kjøp gave til " + name + " før " + String(KalD.dayOfMonth(d)) + ". " + KalD.months[KalD.month(d) - 1]
        let who: String = name
        Task { @MainActor in
            do {
                _ = try await KalNet.send("POST", "/api/tasks/glimt", json: ["q": q, "async": true, "source": "kalender-mac"], timeout: 15)
                MacStore.shared.showToast("Lagt til i Huskeliste · gave til " + who, undo: "")
            } catch let e as KalNetError {
                MacStore.shared.showToast(e.status == 404 ? "Huskeliste med Glimt finnes ikke på serveren ennå" : "Fikk ikke lagt til: " + e.message, undo: "")
            } catch {
                MacStore.shared.showToast("Fikk ikke lagt til gaveidéen", undo: "")
            }
        }
    }

    /// Homelab → Bursdager på web (<server>/#/bursdager).
    private func openBirthdays() {
        guard let base = MacSession.bases.first, let u = URL(string: KalAuth41.trim(base) + "/#/bursdager") else { return }
        _ = NSWorkspace.shared.open(u)
    }
}

/// Jenka-toget på bursdagsdagen. TimelineView bare i kortet (ikke i scene/kommandotreet); «Reduser bevegelse» = stille.
struct MacJenka41: View {
    let reduce: Bool

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: reduce)) { (ctx: TimelineViewDefaultContext) in
            MacJenkaFrame41(time: reduce ? 0 : ctx.date.timeIntervalSinceReferenceDate)
        }
        .accessibilityHidden(true)
    }
}

struct MacJenkaFrame41: View {
    let time: Double

    var body: some View {
        GeometryReader { (g: GeometryProxy) in
            let w: CGFloat = g.size.width
            let span: Double = Double(w) + 160
            let head: Double = (time * 38).truncatingRemainder(dividingBy: span) - 80
            ZStack(alignment: .leading) {
                ForEach(0..<5, id: \.self) { (i: Int) in
                    let x: Double = head - Double(i) * 22
                    let hop: Double = abs(sin(time * 5 + Double(i) * 0.9)) * 6
                    MacStar()
                        .fill(LinearGradient(colors: [Color(kalHex: "#ffb38a"), Color(kalHex: "#ff5a3c")], startPoint: .top, endPoint: .bottom))
                        .frame(width: 16, height: 16)
                        .offset(x: CGFloat(x), y: CGFloat(8 - hop))
                }
                Image(systemName: "music.note")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(Color(kalHex: "#f2c14e"))
                    .offset(x: CGFloat(head + 22), y: CGFloat(2 - abs(sin(time * 3)) * 6))
            }
            .frame(width: w, height: g.size.height, alignment: .leading)
        }
    }
}

/* ---------- Søk med Glimt (Ollama) ---------- */

struct MacAiHit41: Identifiable, Hashable {
    let id: String
    let ev: KalEvent
}

@MainActor
final class MacAi41: ObservableObject {
    @Published var on: Bool = false
    @Published var busy: Bool = false
    @Published var answer: String = ""
    @Published var hits: [MacAiHit41] = []
    @Published var local: Bool = false
    private var seq: Int = 0

    func go(_ q: String) {
        let text: String = q.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty {
            on = true
            busy = false
            local = false
            hits = []
            answer = "Skriv et spørsmål, f.eks. «hva skjer i helgen?» eller «når har jeg fri neste uke?»"
            return
        }
        seq += 1
        let id: Int = seq
        on = true
        busy = true
        answer = ""
        hits = []
        local = false
        let store: MacStore = MacStore.shared
        let list: [KalEvent] = KalAi41.window(store.all)
        let lines: [String] = list.map { (e: KalEvent) -> String in KalAi41.line(e, calName: store.cal(e.cal)?.name ?? "") }
        let tk: String = KalD.todayKey()
        Task {
            let res: (String, [String])? = await KalAi41.remoteTimed(text, lines: lines, today: tk)
            if id != self.seq { return }
            self.busy = false
            if let res, !res.0.isEmpty || !res.1.isEmpty {
                self.answer = res.0.isEmpty ? "Fant " + String(res.1.count) + " hendelser." : res.0
                var out: [MacAiHit41] = []
                for i in res.1 {
                    guard let e = list.first(where: { (x: KalEvent) -> Bool in x.id == i }) ?? store.event(i) else { continue }
                    if out.contains(where: { (h: MacAiHit41) -> Bool in h.id == e.id }) { continue }
                    out.append(MacAiHit41(id: e.id, ev: e))
                    if out.count >= 6 { break }
                }
                self.hits = out
                self.local = false
            } else {
                let r: (String, [KalEvent]) = KalAi41.localSearch(text, list: list)
                self.answer = r.0
                self.hits = r.1.map { (e: KalEvent) -> MacAiHit41 in MacAiHit41(id: e.id, ev: e) }
                self.local = true
            }
        }
    }
}

struct MacAiCard41: View {
    @Environment(\.mk) private var t
    @ObservedObject var ai: MacAi41
    let open: (KalEvent) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text("✦").font(.system(size: 10, weight: .bold)).foregroundColor(Color.white)
                    .frame(width: 18, height: 18)
                    .background(Circle().fill(Color(kalHex: "#b23a2a")))
                MacLabel(text: "GLIMT · " + (ai.local ? "UTEN AI" : "OLLAMA"), color: Color(kalHex: "#b23a2a"))
            }
            if ai.busy {
                Text("Leser kalenderen din med Ollama …").font(MacFont.ui(14)).foregroundColor(t.mut)
            } else {
                Text(ai.answer).font(MacFont.ui(14)).foregroundColor(t.ink).textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
                VStack(spacing: 2) {
                    ForEach(ai.hits) { (h: MacAiHit41) in
                        MacSearchRow(e: h.ev) { open(h.ev) }
                    }
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 18).fill(t.card))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(Color(kalHex: "#b23a2a"), lineWidth: 1.5))
    }
}
