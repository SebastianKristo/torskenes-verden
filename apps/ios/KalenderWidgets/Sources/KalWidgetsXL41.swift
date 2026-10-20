import SwiftUI
import WidgetKit

/* ---------------- Prompt 41: Kalender-widgets – ekstra stor (Mac/iPad) og «Ny hendelse» ---------------- */
// Fasit: Kalender App Oversikt.dc.html → MAC · WIDGETS PÅ SKRIVEBORDET. Ekstra stor: venstre kolonne med dagens dato og de tre
// neste, høyre månedsrutenett med uke og prikker + de neste hendelsene. Samme data og lenker som de andre størrelsene.

/// «+ Ny» – åpner kalender://ny (skrivefeltet / Ny hendelse i appen).
struct KalWNewButton41: View {
    let pal: KalWPal

    var body: some View {
        Link(destination: KalWData.newURL) {
            HStack(spacing: 3) {
                Image(systemName: "plus").font(.system(size: 10, weight: .heavy))
                Text("Ny").font(KalFont.uiW(11, .bold))
            }
            .foregroundStyle(Color.white)
            .padding(.horizontal, 8).frame(height: 22)
            .background(Capsule().fill(Color(kalHex: "#b23a2a")))
            .widgetAccentable()
        }
        .accessibilityLabel("Ny hendelse")
    }
}

struct KalWExtraLarge41: View {
    let entry: KalWEntry
    let pal: KalWPal

    var body: some View {
        let d: Date = entry.date
        let up: [KalEvent] = KalWData.upcoming(entry.snap, now: d)
        HStack(alignment: .top, spacing: 18) {
            VStack(alignment: .leading, spacing: 4) {
                KalWDateBlock(date: d, pal: pal, big: 72)
                Text(KalD.months[KalD.month(d) - 1] + " " + String(KalD.year(d))).font(KalFont.uiW(13)).foregroundStyle(pal.mut)
                Text("UKE " + String(KalWeek35.weekNo(KalWeek35.start(d)))).font(KalFont.monoHeavyW(11.5)).tracking(0.7).foregroundStyle(pal.ink2)
                    .padding(.top, 2)
                VStack(alignment: .leading, spacing: 10) {
                    if up.isEmpty {
                        Text("Ingenting planlagt").font(KalFont.uiW(13, .bold)).foregroundStyle(pal.mut)
                    }
                    ForEach(Array(up.prefix(3)), id: \.self) { (e: KalEvent) in
                        Link(destination: KalWData.eventURL(e)) {
                            KalWRow(e: e, snap: entry.snap, now: d, pal: pal)
                        }
                    }
                }
                .padding(.top, 14)
                Spacer(minLength: 0)
                KalWNewButton41(pal: pal)
            }
            .frame(width: 210, alignment: .leading)
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline) {
                    Text(KalD.cap(KalD.months[KalD.month(d) - 1])).font(KalFont.serifW(24)).foregroundStyle(pal.ink).widgetAccentable()
                    Spacer()
                    Text(String(KalD.year(d))).font(KalFont.monoW(12)).foregroundStyle(pal.mut)
                }
                KalWMonthGrid(entry: entry, pal: pal)
                Spacer(minLength: 0)
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(Array(up.dropFirst(3).prefix(4)), id: \.self) { (e: KalEvent) in
                        Link(destination: KalWData.eventURL(e)) {
                            HStack(spacing: 8) {
                                Circle().fill(Color(kalHex: KalWData.evCal(entry.snap, e)?.hex ?? "#b23a2a")).frame(width: 8, height: 8).widgetAccentable()
                                Text(KalBd41.listTitle(e, calName: KalWData.cal(entry.snap, e.cal)?.name ?? "")).font(KalFont.uiW(13, .bold))
                                    .foregroundStyle(pal.ink).lineLimit(1)
                                Spacer(minLength: 4)
                                Text(KalWData.whenPrefix(e.day, now: d).replacingOccurrences(of: " · ", with: " ") + (e.allDay ? "Hele dagen" : KalD.hm(e.startMin)))
                                    .font(KalFont.monoW(11)).foregroundStyle(pal.mut).lineLimit(1)
                            }
                        }
                    }
                }
                .padding(.top, 10)
                .overlay(alignment: .top) { Rectangle().fill(pal.line).frame(height: 1) }
            }
            .padding(.leading, 18)
            .overlay(alignment: .leading) { Rectangle().fill(pal.line).frame(width: 1) }
        }
    }
}
