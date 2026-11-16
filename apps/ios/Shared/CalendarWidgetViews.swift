import SwiftUI

/* ---------------- Prompt 26: Kalender-widgetene (liten, medium og stor) ---------------- */
// Fasit: «WIDGETS PÅ TELEFONEN» i design/Kalender.dc.html. Visningene brukes både av WidgetKit (FinansHubWidgets)
// og av forhåndsvisningene i appen (iPhone, Android Material You og Samsung One UI). Ingen bakgrunn her:
// widgeten setter containerBackground, forhåndsvisningen sin egen flate.

func cal26Color(_ hex: String) -> Color {
    var h: String = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
    if h.count == 3 { h = h.map { "\($0)\($0)" }.joined() }
    let v: UInt64 = UInt64(h, radix: 16) ?? 0x5C5850
    return Color(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255)
}

/// Farger for én plattform.
struct Cal26WPal {
    var bg: Color
    var fg: Color
    var mut: Color
    var acc: Color
    var line: Color
    var radius: CGFloat
    var chipOff: Color

    static let iosLight = Cal26WPal(bg: Color.white.opacity(0.95), fg: cal26Color("#1b1a17"), mut: cal26Color("#7a7468"), acc: cal26Color("#b23a2a"),
                                    line: Color.black.opacity(0.08), radius: 24, chipOff: Color.black.opacity(0.07))
    static let iosDark = Cal26WPal(bg: cal26Color("#1c1c1e"), fg: Color.white, mut: cal26Color("#98989f"), acc: cal26Color("#ff6b5a"),
                                   line: Color.white.opacity(0.12), radius: 24, chipOff: Color.white.opacity(0.12))
    static let android = Cal26WPal(bg: cal26Color("#f4ddd8"), fg: cal26Color("#3b0f0a"), mut: cal26Color("#7d4a43"), acc: cal26Color("#b23a2a"),
                                   line: cal26Color("#3b0f0a").opacity(0.14), radius: 28, chipOff: Color.black.opacity(0.07))
    static let samsung = Cal26WPal(bg: Color.white, fg: cal26Color("#111111"), mut: cal26Color("#6b6b6b"), acc: cal26Color("#b23a2a"),
                                   line: Color.black.opacity(0.08), radius: 20, chipOff: Color.black.opacity(0.07))
}

/// Liten: «NÅ» / «NESTE TIME» / ukedag, klokkeslett stort, fargestripe, fag, rom og lærer, og «34 min igjen».
struct Cal26WSmall: View {
    let w: CalWidgetState26
    let pal: Cal26WPal

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(w.kicker).font(.system(size: 10, weight: .heavy)).tracking(0.8).foregroundStyle(pal.acc).lineLimit(1)
            Text(w.big).font(.system(size: 30, weight: .bold)).tracking(-0.6).foregroundStyle(pal.fg)
                .lineLimit(1).minimumScaleFactor(0.6).padding(.top, 6)
            Spacer(minLength: 4)
            HStack(spacing: 7) {
                RoundedRectangle(cornerRadius: 2).fill(cal26Color(w.hex)).frame(width: 4, height: 32)
                VStack(alignment: .leading, spacing: 0) {
                    Text(w.title).font(.system(size: 14, weight: .bold)).foregroundStyle(pal.fg).lineLimit(1)
                    Text(w.sub).font(.system(size: 11.5)).foregroundStyle(pal.mut).lineLimit(1)
                }
            }
            Text(w.when).font(.system(size: 11, weight: .bold)).foregroundStyle(pal.acc).lineLimit(1).padding(.top, 6)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

/// Medium: venstre del som liten, høyre del «I dag · mandag 19. okt» og de tre neste timene.
struct Cal26WMedium: View {
    let w: CalWidgetState26
    let pal: Cal26WPal
    var links: Bool = false

    var body: some View {
        GeometryReader { g in
            HStack(alignment: .top, spacing: 12) {
                left.frame(width: Swift.max(90, g.size.width * 0.41), alignment: .topLeading)
                Rectangle().fill(pal.line).frame(width: 1)
                right
            }
        }
    }

    private var left: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(w.kicker).font(.system(size: 10, weight: .heavy)).tracking(0.8).foregroundStyle(pal.acc).lineLimit(1)
            Text(w.big).font(.system(size: 28, weight: .bold)).tracking(-0.5).foregroundStyle(pal.fg)
                .lineLimit(1).minimumScaleFactor(0.6).padding(.top, 6)
            Spacer(minLength: 4)
            Text(w.title).font(.system(size: 14, weight: .bold)).foregroundStyle(pal.fg).lineLimit(1)
            Text(w.sub).font(.system(size: 11.5)).foregroundStyle(pal.mut).lineLimit(1)
            Text(w.when).font(.system(size: 11, weight: .bold)).foregroundStyle(pal.acc).lineLimit(1).padding(.top, 4)
        }
        .frame(maxHeight: .infinity, alignment: .topLeading)
    }

    private var right: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(w.dayShort).font(.system(size: 10.5, weight: .bold)).foregroundStyle(pal.mut).lineLimit(1)
            ForEach(w.next3) { e in
                Cal26WLink(id: e.id, on: links) { Cal26WNextRow(e: e, pal: pal) }
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

struct Cal26WNextRow: View {
    let e: CalWItem26
    let pal: Cal26WPal

    var body: some View {
        HStack(spacing: 7) {
            Text(e.time).font(.system(size: 11, weight: .bold)).monospacedDigit().foregroundStyle(pal.fg).frame(width: 36, alignment: .leading)
            RoundedRectangle(cornerRadius: 2).fill(cal26Color(e.hex)).frame(width: 3, height: 24)
            VStack(alignment: .leading, spacing: 0) {
                Text(e.title).font(.system(size: 12.5, weight: .bold)).foregroundStyle(pal.fg).lineLimit(1)
                Text(e.sub).font(.system(size: 10.5)).foregroundStyle(pal.mut).lineLimit(1)
            }
            Spacer(minLength: 0)
        }
    }
}

/// Stor: «I dag · mandag 19. oktober · 4 timer», dagens timer (passerte dempet), og PRØVER OG FRISTER.
struct Cal26WLarge: View {
    let w: CalWidgetState26
    let pal: Cal26WPal
    var links: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(w.dayLong).font(.system(size: 16, weight: .bold)).foregroundStyle(pal.fg).lineLimit(1)
                Spacer(minLength: 4)
                Text(w.count).font(.system(size: 11, weight: .bold)).foregroundStyle(pal.acc).lineLimit(1)
            }
            if w.all.isEmpty {
                Text("Ingen timer de neste dagene").font(.system(size: 13)).foregroundStyle(pal.mut)
            }
            ForEach(w.all) { e in
                Cal26WLink(id: e.id, on: links) { Cal26WDayRow(e: e, pal: pal) }
            }
            Spacer(minLength: 0)
            Rectangle().fill(pal.line).frame(height: 1)
            Text("PRØVER OG FRISTER").font(.system(size: 10, weight: .heavy)).tracking(0.8).foregroundStyle(pal.acc)
            if w.exams.isEmpty {
                Text("Ingen kommende").font(.system(size: 12.5)).foregroundStyle(pal.mut)
            }
            ForEach(w.exams) { x in
                Cal26WLink(id: x.id, on: links) { Cal26WExamRow(x: x, pal: pal) }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

struct Cal26WDayRow: View {
    let e: CalWItem26
    let pal: Cal26WPal

    var body: some View {
        HStack(spacing: 9) {
            Text(e.time).font(.system(size: 11, weight: .bold)).monospacedDigit().foregroundStyle(pal.mut).frame(width: 78, alignment: .leading)
            RoundedRectangle(cornerRadius: 2).fill(cal26Color(e.hex)).frame(width: 4, height: 28)
            VStack(alignment: .leading, spacing: 0) {
                Text(e.title).font(.system(size: 13.5, weight: .bold)).foregroundStyle(pal.fg).lineLimit(1)
                Text(e.sub).font(.system(size: 11)).foregroundStyle(pal.mut).lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .opacity(e.dim ? 0.45 : 1)
    }
}

struct Cal26WExamRow: View {
    let x: CalWExam26
    let pal: Cal26WPal

    var body: some View {
        HStack(spacing: 8) {
            Text(x.title).font(.system(size: 13, weight: .bold)).foregroundStyle(pal.fg).lineLimit(1)
            Spacer(minLength: 4)
            Text(x.inText).font(.system(size: 10.5, weight: .heavy)).foregroundStyle(x.red ? Color.white : pal.fg)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(x.red ? cal26Color(Cal26.red) : pal.chipOff, in: Capsule())
        }
    }
}

/// Trykk på en time i widgeten åpner detaljkortet (finanshub://kalender/<id>). I forhåndsvisningen: ingen lenke.
struct Cal26WLink<C: View>: View {
    let id: String
    let on: Bool
    @ViewBuilder let content: () -> C

    var body: some View {
        if on, let u = Self.url(id) {
            Link(destination: u) { content() }
        } else {
            content()
        }
    }

    static func url(_ id: String) -> URL? {
        let enc: String = id.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? ""
        return URL(string: "finanshub://kalender/" + enc)
    }
}
