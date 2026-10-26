import SwiftUI
import UIKit

/* ---------------- Prompt 31: Chat – Glimt svarer med kort (vær, kalender, avganger, pakker, finans, huskeliste) ---------------- */
// Fasit: design/Mobil Papir App.dc.html → chToolRun() + chCardVals() (m.isWx, m.isCal), prompts/prompt-31-pakke/
// claude-code-chat-kort-vaer-kalender.md og claude-code-ai-chat-vaerkort-fiks.md (værkortet er ÉN flate: gradienten ligger
// bak hele kortet, også timeraden, med en tynn hvit skillelinje).
// Ruting: spørsmål som ligner et verktøy (vær, kalender, «neste time», avganger, pakker, finans, huskeliste, prøveperiode)
// går til POST /api/assist {q, source:'chat', chatId}. Svaret er én kort setning + kortet; verktøy-brikke «Brukte Vær»,
// status «Verktøy · 0,6 s». Kortet lagres i meldingen (card: {k, …}) og vises igjen i historikken. Andre spørsmål strømmes
// fra valgt modell som før.

enum Chat31 {
    /// Ser spørsmålet ut som et verktøy-spørsmål? (Samme ord som chToolRun/hsAsk i fasiten.)
    static func isTool(_ q: String) -> Bool {
        let n: String = q.lowercased()
        let pats: [String] = [
            "v(æ|ae)r(et)?\\b", "\\bregn", "paraply", "grader", "temperatur", "\\bsnø", "\\bvind", "kaldt", "varmt",
            "kalender", "avtale", "timeplan", "hva skjer", "hva har jeg", "\\bplaner", "\\bi morgen\\b", "\\bi dag\\b",
            "neste .*time", "når (er|skal|har)", "frisør", "tannlege",
            "avgang", "\\bbuss", "\\btrikk", "t-bane", "når går",
            "pakke", "sending", "sporing",
            "brukt på", "hva har jeg brukt", "forbruk",
            "huskeliste", "oppgaver", "gjøremål",
            "pr(ø|o)ve", "gratis", "avslutt", "si opp", "oppsig", "trial",
        ]
        for p in pats where n.range(of: p, options: .regularExpression) != nil { return true }
        return false
    }

    /// «Vær», «Kalender» … fra intent (når serveren ikke sender tool).
    static func toolName(_ a: Assist31Answer) -> String {
        if !a.tool.isEmpty { return a.tool }
        let i: String = a.intent
        if i.hasPrefix("weather") { return "Vær" }
        if i.hasPrefix("calendar") || i.hasPrefix("appointment") { return "Kalender" }
        if i.hasPrefix("departures") { return "Avganger" }
        if i.hasPrefix("packages") { return "Pakker" }
        if i.hasPrefix("finance") { return "Finans" }
        if i.hasPrefix("tasks") { return "Gjøremål" }
        if i.hasPrefix("trial") { return "Abonnementer" }
        return ""
    }

    static func card(_ json: String) -> [String: Any]? {
        if json.isEmpty { return nil }
        return (try? JSONSerialization.jsonObject(with: Data(json.utf8))) as? [String: Any]
    }

    static func kind(_ o: [String: Any]) -> String {
        let k: String = (JS.str(o, "k") ?? JS.str(o, "kind") ?? JS.str(o, "type") ?? "").lowercased()
        switch k {
        case "wx", "weather", "vaer", "vær": return "weather"
        case "cal", "calendar", "kalender": return "calendar"
        case "dep", "departures", "avganger": return "departures"
        case "pk", "packages", "pakker", "tracking": return "packages"
        case "fin", "finance", "finans": return "finance"
        case "tasks", "huskeliste", "todo": return "tasks"
        default: return k
        }
    }

    /// MET-symbolkode («partlycloudy_day») eller emoji → emoji.
    static func icon(_ raw: String, night: Bool) -> String {
        let s: String = raw.lowercased()
        if raw.isEmpty { return night ? "🌙" : "☀️" }
        if raw.unicodeScalars.first.map({ $0.properties.isEmojiPresentation || $0.value > 0x2000 }) == true && raw.count <= 3 { return raw }
        if s.contains("thunder") { return "⛈️" }
        if s.contains("snow") || s.contains("sleet") { return "🌨️" }
        if s.contains("showers") { return "🌦️" }
        if s.contains("rain") { return "🌧️" }
        if s.contains("fog") { return "🌫️" }
        if s.contains("partlycloudy") { return night ? "☁️" : "⛅" }
        if s.contains("cloudy") { return "☁️" }
        if s.contains("fair") { return night ? "🌙" : "🌤️" }
        if s.contains("clear") { return s.contains("night") || night ? "🌙" : "☀️" }
        return raw.count <= 3 ? raw : "🌤️"
    }

    static func deg(_ o: [String: Any]?, _ keys: [String]) -> String {
        for k in keys {
            if let v = JS.num(o, k) { return "\(Int(v.rounded()))°" }
            if let s = JS.str(o, k) { return s.hasSuffix("°") ? s : s + "°" }
        }
        return ""
    }
}

extension ChatStore27 {
    /// Prompt 31: verktøy-spørsmål går via Glimt-ruteren. true = håndtert her (ingen strømming).
    func toolRun31(_ q: String, _ store: Store) -> Bool {
        if !attach.isEmpty || !Chat31.isTool(q) || Assist31.shared.missing { return false }
        busy = true
        pendingTool31 = true
        streamText = ""
        streamTool = []
        scrollTick += 1
        let chat: String? = curId
        Task {
            let a: Assist31Answer? = await Assist31.shared.ask(q, source: "chat", chatId: chat, page: "chat", store)
            self.pendingTool31 = false
            guard let a, !a.text.isEmpty else {
                // Ingen svar fra ruteren (eldre server, feil): vanlig strømming fra modellen.
                self.busy = false
                self.runAfterTool31(store)
                return
            }
            if !a.chatId.isEmpty && self.curId == nil { self.curId = a.chatId }
            var m = ChatMsg27(role: "assistant", content: a.text)
            m.model = Glimt31.name
            let tool: String = Chat31.toolName(a)
            if !tool.isEmpty { m.used = [tool] }
            m.card31 = a.cardJSON
            m.glimt67 = true
            let sec: String = String(format: "%.1f", Swift.max(0.1, a.ms / 1000)).replacingOccurrences(of: ".", with: ",")
            m.stats = (tool.isEmpty ? Glimt31.name : "Verktøy") + " · " + sec + " s"
            self.msgs.append(m)
            self.busy = false
            self.scrollTick += 1
            Haptics.shared.select()
            Task { await self.loadChats(store) }
        }
        return true
    }
}

/* ---------- Kortene ---------- */

/// Kortet under svaret (eller ingenting).
struct Chat31Card: View {
    let json: String
    let c: ChatPal27

    var body: some View {
        if let o = Chat31.card(json) {
            switch Chat31.kind(o) {
            case "weather": Chat31Weather(o: o)
            case "calendar": Chat31Calendar(o: o, c: c)
            case "departures": Chat31Departures(o: o, c: c)
            case "packages": Chat31Packages(o: o, c: c)
            case "finance": Chat31Finance(o: o, c: c)
            case "tasks": Chat31Tasks(o: o, c: c)
            case "cal70": if let d = Cal70Data.parse(o) { Cal70CardView(card: d, mode: .chat).id(d.eventId) } // prompt 70: kort A
            default: EmptyView()
            }
        }
    }
}

/// Vær som Apple Vær-widgeten: ÉN flate (radius 22, overflow skjult), gradienten bak hele kortet, timeraden inne i samme flate.
struct Chat31Weather: View {
    @Environment(Store.self) private var store
    let o: [String: Any]

    var body: some View {
        let night: Bool = JS.bool(o, "night") ?? false
        let desc: String = JS.str(o, "d") ?? JS.str(o, "desc") ?? JS.str(o, "description") ?? JS.str(o, "text") ?? ""
        let hours: [[String: Any]] = Chat31Weather.hours(o)
        Button { store.weatherOpen = true } label: {
            VStack(alignment: .leading, spacing: 0) {
                Chat31WeatherTop(o: o, night: night, desc: desc)
                if !hours.isEmpty {
                    Chat31WeatherHours(hours: hours, night: night)
                }
            }
            .frame(maxWidth: 420, alignment: .leading)
            .background(Chat31Weather.gradient(desc, night: night))
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .shadow(color: Color(hex: "#14325a").opacity(0.45), radius: 14, y: 12)
            .contentShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityHint("Åpner Vær")
    }

    static func hours(_ o: [String: Any]) -> [[String: Any]] {
        let a: [[String: Any]] = JS.list(o, "h")
        return a.isEmpty ? JS.list(o, "hours") : a
    }

    /// Mørkere nederst for kontrast mot hvit tekst: klart · grått/regn · natt.
    static func gradient(_ desc: String, night: Bool) -> LinearGradient {
        let d: String = desc.lowercased()
        if night {
            return LinearGradient(colors: [Color(hex: "#0e1a33"), Color(hex: "#2b3a5c")], startPoint: .top, endPoint: .bottom)
        }
        let grey: Bool = ["regn", "byger", "overskyet", "tåke", "snø", "sludd", "skyet"].contains { d.contains($0) } && !d.contains("lettskyet")
        if grey {
            return LinearGradient(colors: [Color(hex: "#46525f"), Color(hex: "#6f7b8a")], startPoint: .top, endPoint: .bottom)
        }
        return LinearGradient(stops: [.init(color: Color(hex: "#134a86"), location: 0), .init(color: Color(hex: "#3f74ab"), location: 0.7),
                                      .init(color: Color(hex: "#5f8fc0"), location: 1)], startPoint: .top, endPoint: .bottom)
    }
}

struct Chat31WeatherTop: View {
    let o: [String: Any]
    let night: Bool
    let desc: String

    var body: some View {
        let city: String = JS.str(o, "city") ?? JS.str(o, "place") ?? JS.str(o, "name") ?? ""
        let temp: String = Chat31.deg(o, ["t", "temp", "temperature"])
        let hi: String = Chat31.deg(o, ["hi", "max", "high"])
        let lo: String = Chat31.deg(o, ["lo", "min", "low"])
        let ic: String = Chat31.icon(JS.str(o, "ic") ?? JS.str(o, "icon") ?? JS.str(o, "symbol") ?? "", night: night)
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(city).font(.dyn51(size: 16, weight: .bold)).lineLimit(1)
                    Image(systemName: "location.fill").font(.dyn51(size: 11, weight: .bold))
                }
                Text(temp).font(.dyn51(size: 44, weight: .light)).lineLimit(1)
            }
            Spacer(minLength: 6)
            VStack(alignment: .trailing, spacing: 4) {
                Text(ic).font(.dyn51(size: 24))
                Spacer(minLength: 0)
                Text(Cal26.cap(desc)).font(.dyn51(size: 13.5, weight: .semibold)).opacity(0.85).lineLimit(1)
                if !hi.isEmpty || !lo.isEmpty {
                    Text("H:" + hi + " L:" + lo).font(.dyn51(size: 13.5, weight: .semibold)).opacity(0.85).lineLimit(1)
                }
            }
        }
        .foregroundStyle(Color.white)
        .padding(.horizontal, 18).padding(.top, 16).padding(.bottom, 14)
        .fixedSize(horizontal: false, vertical: true)
    }
}

/// Timeraden i samme flate: 14 pt innrykk, tynn hvit linje over, hvit tekst.
struct Chat31WeatherHours: View {
    let hours: [[String: Any]]
    let night: Bool

    var body: some View {
        VStack(spacing: 0) {
            Rectangle().fill(Color.white.opacity(0.22)).frame(height: 1)
            HStack(spacing: 4) {
                ForEach(Array(hours.prefix(6).enumerated()), id: \.offset) { (pair: (offset: Int, element: [String: Any])) in
                    Chat31WeatherHour(o: pair.element, night: night)
                }
            }
            .padding(.top, 10).padding(.bottom, 14)
        }
        .padding(.horizontal, 14)
        .foregroundStyle(Color.white)
    }
}

struct Chat31WeatherHour: View {
    let o: [String: Any]
    let night: Bool

    var body: some View {
        let h: String = JS.str(o, "h") ?? JS.str(o, "time") ?? JS.str(o, "label") ?? ""
        let ic: String = Chat31.icon(JS.str(o, "ic") ?? JS.str(o, "icon") ?? JS.str(o, "symbol") ?? "", night: night)
        VStack(spacing: 4) {
            Text(h.count > 5 ? String(h.dropFirst(11).prefix(2)) : h).font(.dyn51(size: 12, weight: .semibold)).opacity(0.85).lineLimit(1)
            Text(ic).font(.dyn51(size: 17))
            Text(Chat31.deg(o, ["t", "temp"])).font(.dyn51(size: 14, weight: .semibold)).lineLimit(1)
        }
        .frame(maxWidth: .infinity)
    }
}

/// Kalender: lite kalenderikon (rød stripe med ukedag, dato) · «I dag» · «19. oktober · 2 hendelser» · ›, så listen.
struct Chat31Calendar: View {
    @Environment(Store.self) private var store
    let o: [String: Any]
    let c: ChatPal27

    var body: some View {
        let items: [[String: Any]] = Chat31Calendar.items(o)
        VStack(spacing: 0) {
            Button { open() } label: { header(items.count) }
                .buttonStyle(.plain)
            ForEach(Array(items.enumerated()), id: \.offset) { (pair: (offset: Int, element: [String: Any])) in
                Chat31CalRow(o: pair.element, c: c, first: pair.offset == 0)
            }
            if items.isEmpty {
                Text("Ingenting i kalenderen.").font(c.ui(14)).foregroundStyle(c.mut)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16).padding(.vertical, 12)
            }
        }
        .frame(maxWidth: 420)
        .background(c.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(c.line, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    static func items(_ o: [String: Any]) -> [[String: Any]] {
        let a: [[String: Any]] = JS.list(o, "items")
        return a.isEmpty ? JS.list(o, "events") : a
    }

    private var day: Date? {
        guard let d = JS.str(o, "date"), d.count >= 10 else { return nil }
        return Cal26.day(String(d.prefix(10)))
    }

    private func header(_ n: Int) -> some View {
        let d: Date = day ?? Date()
        let wd: String = JS.str(o, "wd") ?? String(Cal26.weekdays[Cal26.jsDay(d)].prefix(3)).uppercased()
        let num: String = JS.str(o, "n") ?? String(Calendar.current.component(.day, from: d))
        let title: String = JS.str(o, "t") ?? JS.str(o, "title") ?? "I dag"
        let sub: String = JS.str(o, "sub") ?? (Cal26.dShort(d) + " · \(n) " + (n == 1 ? "hendelse" : "hendelser"))
        return HStack(spacing: 10) {
            VStack(spacing: 0) {
                Text(wd).font(PF.ui(8.5, .heavy)).tracking(0.5).foregroundStyle(Color.white)
                    .frame(maxWidth: .infinity).padding(.vertical, 2)
                    .background(Color(hex: "#b23a2a"))
                Text(num).font(PF.ui(18, .bold)).foregroundStyle(Color(hex: "#1b1a17"))
                    .frame(maxHeight: .infinity)
            }
            .frame(width: 38, height: 40)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .shadow(color: Color.black.opacity(0.15), radius: 1.5, y: 1)
            VStack(alignment: .leading, spacing: 0) {
                Text(title).font(c.ui(15, .bold)).foregroundStyle(c.ink)
                Text(sub).font(c.ui(12.5)).foregroundStyle(c.mut).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text("›").font(c.ui(16)).foregroundStyle(c.mut)
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
        .overlay(alignment: .bottom) { Rectangle().fill(c.line).frame(height: 1) }
        .contentShape(Rectangle())
    }

    private func open() {
        Haptics.shared.select()
        // Prompt 33: Kalender-appen (dagen, eller Liste) når den er installert.
        if let d = JS.str(o, "date"), d.count >= 10 { if KalLink33.day(d) { return } } else if KalLink33.list() { return }
        store.paperGo("kalender")
        if let d = JS.str(o, "date"), d.count >= 10 { Cal27Model.shared.goDay(String(d.prefix(10))) }
    }
}

struct Chat31CalRow: View {
    let o: [String: Any]
    let c: ChatPal27
    let first: Bool

    var body: some View {
        let title: String = JS.str(o, "t") ?? JS.str(o, "title") ?? ""
        let tm: String = Chat31CalRow.time(o)
        let col: String = JS.str(o, "c") ?? JS.str(o, "color") ?? "#2b5d8a"
        HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 2).fill(Color(hex: col)).frame(width: 4)
            Text(tm).font(PF.mono(12.5)).foregroundStyle(c.mut).frame(width: 44, alignment: .leading).lineLimit(1)
            Text(title).font(c.ui(14.5, .semibold)).foregroundStyle(c.ink).lineLimit(1).truncationMode(.tail)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .fixedSize(horizontal: false, vertical: true)
        .overlay(alignment: .top) { if !first { Rectangle().fill(c.line).frame(height: 1) } }
    }

    /// «16:30» eller «Hele» for heldag.
    static func time(_ o: [String: Any]) -> String {
        if let t = JS.str(o, "tm") { return t }
        if JS.bool(o, "allDay") == true || JS.bool(o, "all") == true { return "Hele" }
        let s: String = JS.str(o, "start") ?? ""
        if s.count >= 16 { return String(s.dropFirst(11).prefix(5)) }
        return s.isEmpty ? "Hele" : s
    }
}

/// Avganger: linjenummer-merker + minutter.
struct Chat31Departures: View {
    let o: [String: Any]
    let c: ChatPal27

    var body: some View {
        let rows: [[String: Any]] = JS.list(o, "items").isEmpty ? JS.list(o, "departures") : JS.list(o, "items")
        Chat31Box(title: JS.str(o, "stop") ?? JS.str(o, "title") ?? "Avganger", c: c) {
            ForEach(Array(rows.prefix(6).enumerated()), id: \.offset) { (pair: (offset: Int, element: [String: Any])) in
                Chat31DepRow(o: pair.element, c: c, first: pair.offset == 0)
            }
        }
    }
}

struct Chat31DepRow: View {
    let o: [String: Any]
    let c: ChatPal27
    let first: Bool

    var body: some View {
        let line: String = JS.str(o, "line") ?? JS.str(o, "l") ?? ""
        let dest: String = JS.str(o, "dest") ?? JS.str(o, "destination") ?? JS.str(o, "to") ?? ""
        let col: String = JS.str(o, "color") ?? "#d0605a"
        let mins: String = Chat31DepRow.minutes(o)
        HStack(spacing: 10) {
            Text(line).font(PF.ui(12.5, .heavy)).foregroundStyle(Color.white).lineLimit(1).fixedSize()
                .padding(.horizontal, 7).frame(minWidth: 30, minHeight: 24)
                .background(Color(hex: col), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
            Text(dest).font(c.ui(14.5, .semibold)).foregroundStyle(c.ink).lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(mins).font(PF.mono(13)).foregroundStyle(c.ink).lineLimit(1).fixedSize()
        }
        .padding(.horizontal, 16).padding(.vertical, 9)
        .overlay(alignment: .top) { if !first { Rectangle().fill(c.line).frame(height: 1) } }
    }

    /// «Nå», «3 min» eller klokkeslett.
    static func minutes(_ o: [String: Any]) -> String {
        if let m = JS.int(o, "min") ?? JS.int(o, "minutes") { return m <= 0 ? "Nå" : "\(m) min" }
        return JS.str(o, "time") ?? ""
    }
}

/// Pakker: status + fremdrift.
struct Chat31Packages: View {
    let o: [String: Any]
    let c: ChatPal27

    var body: some View {
        let rows: [[String: Any]] = JS.list(o, "items").isEmpty ? JS.list(o, "packages") : JS.list(o, "items")
        Chat31Box(title: JS.str(o, "title") ?? "Pakker", c: c) {
            ForEach(Array(rows.prefix(5).enumerated()), id: \.offset) { (pair: (offset: Int, element: [String: Any])) in
                Chat31PkgRow(o: pair.element, c: c, first: pair.offset == 0)
            }
        }
    }
}

struct Chat31PkgRow: View {
    let o: [String: Any]
    let c: ChatPal27
    let first: Bool

    var body: some View {
        let name: String = JS.str(o, "name") ?? JS.str(o, "title") ?? JS.str(o, "n") ?? "Sending"
        let status: String = JS.str(o, "status") ?? JS.str(o, "s") ?? ""
        let raw: Double = JS.num(o, "progress") ?? JS.num(o, "p") ?? 0
        let pr: Double = raw > 1 ? raw / 100 : raw
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(name).font(c.ui(14.5, .semibold)).foregroundStyle(c.ink).lineLimit(1)
                Spacer(minLength: 6)
                Text(status).font(c.ui(12.5)).foregroundStyle(c.mut).lineLimit(1)
            }
            GeometryReader { (g: GeometryProxy) in
                ZStack(alignment: .leading) {
                    Capsule().fill(c.line)
                    Capsule().fill(c.acc).frame(width: Swift.max(4, g.size.width * CGFloat(Swift.min(1, pr))))
                }
            }
            .frame(height: 4)
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .overlay(alignment: .top) { if !first { Rectangle().fill(c.line).frame(height: 1) } }
    }
}

/// Finans: sum + tre største poster.
struct Chat31Finance: View {
    let o: [String: Any]
    let c: ChatPal27

    var body: some View {
        let rows: [[String: Any]] = JS.list(o, "items").isEmpty ? JS.list(o, "top") : JS.list(o, "items")
        let total: String = Chat31Finance.money(o, ["total", "sum"])
        Chat31Box(title: JS.str(o, "title") ?? JS.str(o, "label") ?? "Finans", c: c) {
            Text(total).font(c.head(34)).foregroundStyle(c.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 16).padding(.top, 10).padding(.bottom, 4)
            ForEach(Array(rows.prefix(3).enumerated()), id: \.offset) { (pair: (offset: Int, element: [String: Any])) in
                Chat31FinRow(o: pair.element, c: c)
            }
        }
    }

    /// Første tall blant nøklene som «1 234 kr» (eller teksten som den er).
    static func money(_ o: [String: Any], _ keys: [String]) -> String {
        for k in keys {
            if let v = JS.num(o, k) { return kr(abs(v)) }
        }
        for k in keys {
            if let s = JS.str(o, k) { return s }
        }
        return ""
    }

    static func kr(_ v: Double) -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.locale = Locale(identifier: "nb_NO")
        f.maximumFractionDigits = 0
        return (f.string(from: NSNumber(value: v)) ?? String(Int(v))) + " kr"
    }
}

struct Chat31FinRow: View {
    let o: [String: Any]
    let c: ChatPal27

    var body: some View {
        let name: String = JS.str(o, "name") ?? JS.str(o, "merchant") ?? JS.str(o, "n") ?? ""
        let amount: String = Chat31Finance.money(o, ["amount", "v"])
        HStack {
            Text(name).font(c.ui(14)).foregroundStyle(c.ink).lineLimit(1)
            Spacer(minLength: 6)
            Text(amount).font(PF.mono(13)).foregroundStyle(c.ink).lineLimit(1).fixedSize()
        }
        .padding(.horizontal, 16).padding(.vertical, 7)
        .overlay(alignment: .top) { Rectangle().fill(c.line).frame(height: 1) }
    }
}

/// Huskeliste: avkryssbare punkter direkte i kortet (PATCH /api/tasks/:id {done}).
struct Chat31Tasks: View {
    let o: [String: Any]
    let c: ChatPal27

    var body: some View {
        let rows: [[String: Any]] = JS.list(o, "items").isEmpty ? JS.list(o, "tasks") : JS.list(o, "items")
        Chat31Box(title: JS.str(o, "title") ?? "Gjøremål", c: c) {
            ForEach(Array(rows.prefix(8).enumerated()), id: \.offset) { (pair: (offset: Int, element: [String: Any])) in
                Chat31TaskRow(o: pair.element, c: c, first: pair.offset == 0)
            }
        }
    }
}

struct Chat31TaskRow: View {
    @Environment(Store.self) private var store
    let o: [String: Any]
    let c: ChatPal27
    let first: Bool
    @State private var done: Bool? = nil

    var body: some View {
        let title: String = JS.str(o, "title") ?? JS.str(o, "t") ?? JS.str(o, "text") ?? ""
        let on: Bool = done ?? (JS.bool(o, "done") ?? false)
        Button { toggle(!on) } label: {
            HStack(spacing: 10) {
                Image(systemName: on ? "checkmark.circle.fill" : "circle").font(.dyn51(size: 18, weight: .semibold))
                    .foregroundStyle(on ? c.acc : c.mut)
                Text(title).font(c.ui(14.5, .semibold)).foregroundStyle(on ? c.mut : c.ink).strikethrough(on).lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 16).padding(.vertical, 9)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .top) { if !first { Rectangle().fill(c.line).frame(height: 1) } }
    }

    private func toggle(_ v: Bool) {
        guard let id = JS.str(o, "id") else { return }
        Haptics.shared.tick()
        done = v
        let enc: String = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
        let a: API = store.api
        Task {
            _ = try? await a.callAt("/api", "PATCH", "/tasks/" + enc, json: ["done": v])
            await TasksModel.shared.load(store)
        }
    }
}

/// Felles ramme for de enkle kortene: tittel øverst, rader under.
struct Chat31Box<Content: View>: View {
    let title: String
    let c: ChatPal27
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(spacing: 0) {
            Text(title).font(c.ui(15, .bold)).foregroundStyle(c.ink).lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 16).padding(.vertical, 12)
                .overlay(alignment: .bottom) { Rectangle().fill(c.line).frame(height: 1) }
            content()
        }
        .padding(.bottom, 4)
        .frame(maxWidth: 420)
        .background(c.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(c.line, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}
