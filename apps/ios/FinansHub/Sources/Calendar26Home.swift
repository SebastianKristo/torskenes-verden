import SwiftUI
import UIKit

/* ---------------- Prompt 26: KALENDER på Hjem og widget-forhåndsvisningene ---------------- */
// Hjem-kortet (h10) følger `mode="widget"` i design/Kalender.dc.html: NÅ / NESTE TIME / ukedag, fag i Newsreader med
// fargestripe, rom og lærer, klokkeslett med «om 1 t 5 min» eller «34 min igjen», de tre neste timene som brikker
// og NESTE PRØVE med nedtelling. Trykk åpner Kalender.

struct Cal26HomeCard: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Cal26Model { Cal26Model.shared }

    var body: some View {
        TimelineView(.everyMinute) { ctx in
            Cal26HomeCardBody(now: ctx.date)
        }
        .task(id: store.account?.id ?? "") { await m.load(store) }
    }
}

struct Cal26HomeCardBody: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Cal26Model { Cal26Model.shared }
    let now: Date

    var body: some View {
        let w: CalWidgetState26 = Cal26.widget(m.events, now: now, colors: m.subjectColors)
        Button { store.paperGo("kalender") } label: {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline) {
                    Text("KALENDER · " + w.kicker).font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.lab).lineLimit(1)
                    Spacer(minLength: 4)
                    Text(w.dayShort + " ›").font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1)
                }
                main(w)
                if !w.next3.isEmpty { chips(w) }
                if let x = w.exams.first { exam(x) }
            }
            .padding(.horizontal, 16).padding(.vertical, 14)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func main(_ w: CalWidgetState26) -> some View {
        HStack(alignment: .center, spacing: 12) {
            RoundedRectangle(cornerRadius: 3).fill(Color(hex: w.hex)).frame(width: 5, height: 44)
            VStack(alignment: .leading, spacing: 1) {
                Text(m.loaded || !w.title.isEmpty ? w.title : "Henter …").font(PF.serif(22, medium: true)).foregroundStyle(p.ink).lineLimit(1)
                Text(w.sub).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(1)
            }
            Spacer(minLength: 4)
            VStack(alignment: .trailing, spacing: 2) {
                Text(w.big).font(PF.serif(26, medium: true)).foregroundStyle(p.ink).lineLimit(1)
                Text(w.when).font(PF.ui(11.5, .bold)).foregroundStyle(p.lab).lineLimit(1)
            }
            .fixedSize()
        }
    }

    private func chips(_ w: CalWidgetState26) -> some View {
        HStack(spacing: 6) {
            ForEach(w.next3) { e in
                VStack(alignment: .leading, spacing: 2) {
                    Text(e.time).font(PF.mono(12, bold: false)).foregroundStyle(p.mut)
                    Text(e.title).font(PF.ui(12.5, .bold)).foregroundStyle(p.ink).lineLimit(1)
                }
                .padding(.leading, 12).padding(.trailing, 9).padding(.vertical, 7)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(p.bg)
                .overlay(alignment: .leading) { Rectangle().fill(Color(hex: e.hex)).frame(width: 3) }
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        }
    }

    private func exam(_ x: CalWExam26) -> some View {
        VStack(spacing: 8) {
            Rectangle().fill(p.line).frame(height: 1)
            HStack(spacing: 8) {
                Text("NESTE PRØVE").font(PF.mono(10)).tracking(0.8).foregroundStyle(p.lab).fixedSize()
                Text(x.title).font(PF.ui(13, .bold)).foregroundStyle(p.ink).lineLimit(1)
                Spacer(minLength: 4)
                Text(x.inText).font(PF.ui(10.5, .heavy)).foregroundStyle(x.red ? Color.white : p.ink).lineLimit(1)
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(x.red ? Color(hex: "#b23a2a") : p.bg, in: Capsule())
                    .fixedSize()
            }
        }
    }
}

/* ---------- E: Widgets på telefonen ---------- */

struct Cal26PlatformSpec {
    let name: String
    let pal: Cal26WPal
    let small: CGSize
    let medium: CGSize
    let large: CGSize
    let labels: [String]

    static let all: [Cal26PlatformSpec] = [
        Cal26PlatformSpec(name: "iPhone · WidgetKit", pal: Cal26WPal.iosLight, small: CGSize(width: 158, height: 158),
                          medium: CGSize(width: 338, height: 158), large: CGSize(width: 338, height: 354), labels: ["Liten", "Medium", "Stor"]),
        Cal26PlatformSpec(name: "Android · Material You", pal: Cal26WPal.android, small: CGSize(width: 170, height: 170),
                          medium: CGSize(width: 350, height: 170), large: CGSize(width: 350, height: 350), labels: ["2 × 2", "4 × 2", "4 × 4"]),
        Cal26PlatformSpec(name: "Samsung One UI", pal: Cal26WPal.samsung, small: CGSize(width: 134, height: 155),
                          medium: CGSize(width: 296, height: 155), large: CGSize(width: 296, height: 330), labels: ["2 × 2", "4 × 2", "4 × 4"]),
    ]
}

struct Cal26WidgetsCard: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Cal26Model { Cal26Model.shared }
    let now: Date

    var body: some View {
        let w: CalWidgetState26 = Cal26.widget(m.events, now: now, colors: m.subjectColors)
        VStack(alignment: .leading, spacing: 10) {
            Text("WIDGETS PÅ TELEFONEN").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.lab)
                .padding(.horizontal, 4).padding(.top, 6)
            ForEach(Array(Cal26PlatformSpec.all.enumerated()), id: \.offset) { _, spec in
                Cal26PlatformPlate(spec: spec, w: w)
            }
            Text("Liten viser neste time, medium også de tre neste, og stor hele dagen og de neste prøvene. Trykk åpner Kalender.")
                .font(PF.ui(12)).foregroundStyle(p.mut).lineSpacing(2).padding(.horizontal, 4)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

struct Cal26PlatformPlate: View {
    let spec: Cal26PlatformSpec
    let w: CalWidgetState26

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(spec.name).font(.system(size: 12.5, weight: .bold)).foregroundStyle(Color.white)
            labeled(spec.labels[0]) {
                box(spec.small, pad: 14) { Cal26WSmall(w: w, pal: spec.pal) }
            }
            labeled(spec.labels[1]) {
                box(spec.medium, pad: 14) { Cal26WMedium(w: w, pal: spec.pal) }
            }
            labeled(spec.labels[2]) {
                box(spec.large, pad: 16) { Cal26WLarge(w: w, pal: spec.pal) }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LinearGradient(colors: [Color(hex: "#6d7f8f"), Color(hex: "#2e3a46")], startPoint: .topLeading, endPoint: .bottomTrailing),
                    in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private func labeled<V: View>(_ label: String, @ViewBuilder _ v: () -> V) -> some View {
        VStack(spacing: 6) {
            v()
            Text(label).font(.system(size: 11, weight: .bold)).foregroundStyle(Color.white.opacity(0.85))
        }
    }

    private func box<V: View>(_ size: CGSize, pad: CGFloat, @ViewBuilder _ v: () -> V) -> some View {
        v()
            .padding(pad)
            .frame(maxWidth: size.width)
            .frame(height: size.height)
            .background(spec.pal.bg, in: RoundedRectangle(cornerRadius: spec.pal.radius, style: .continuous))
            .shadow(color: .black.opacity(0.25), radius: 12, y: 8)
            .environment(\.colorScheme, .light)
    }
}
