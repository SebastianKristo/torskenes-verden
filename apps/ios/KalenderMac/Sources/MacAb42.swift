import SwiftUI
import AppKit

/* ---------------- Prompt 42: Abonnementer i Kalender for Mac ---------------- */
// Samme kalender som iPhone/iPad (KalAb42Core): chip med logo + navn, «3 trekk · 627 kr» i Måned, merke TREKK / PRØVE / ÅRLIG og
// beløp i Liste, og et eget ark (logo, beløp, konto, intervall, neste trekk, Åpne i Finans ›, Si opp …). Ikke redigerbart her.

@MainActor
final class MacAbLogos42: ObservableObject {
    static let shared: MacAbLogos42 = MacAbLogos42()
    @Published var images: [String: NSImage] = [:]
    private var busy: Set<String> = []

    func load(_ path: String) {
        if path.isEmpty || images[path] != nil || busy.contains(path) { return }
        busy.insert(path)
        Task { @MainActor in
            let d: Data? = await MacAbLogos42.fetch(path)
            if let d, let img = NSImage(data: d) { self.images[path] = img }
        }
    }

    nonisolated static func fetch(_ path: String) async -> Data? {
        if path.hasPrefix("data:") {
            guard let comma = path.firstIndex(of: ",") else { return nil }
            return Data(base64Encoded: String(path[path.index(after: comma)...]))
        }
        if path.hasPrefix("/") { return try? await KalNet.get(path, timeout: 10) }
        guard let u = URL(string: path) else { return nil }
        let pair: (Data, URLResponse)? = try? await URLSession.shared.data(from: u)
        return pair?.0
    }
}

struct MacAbLogo42: View {
    @Environment(\.mk) private var t
    @ObservedObject var logos: MacAbLogos42 = MacAbLogos42.shared
    let e: KalEvent
    var size: CGFloat = 12

    var body: some View {
        let path: String = KalAb42.logoPath(e)
        let c: KalCal? = MacStore.shared.cal(e.cal)
        ZStack {
            if let img = logos.images[path] {
                Image(nsImage: img).resizable().scaledToFit()
                    .frame(width: size, height: size)
                    .background(Color.white)
            } else {
                Rectangle().fill(t.calColor(c))
                Text(KalAb42.initial(e)).font(.system(size: size * 0.6, weight: .heavy)).foregroundColor(Color.white)
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: size * 0.26, style: .continuous))
        .onAppear { logos.load(path) }
        .accessibilityHidden(true)
    }
}

struct MacAbBadge42: View {
    @Environment(\.mk) private var t
    let e: KalEvent

    var body: some View {
        let b: String = e.ab42?.badge ?? "TREKK"
        let c: KalCal? = MacStore.shared.cal(e.cal)
        Text(b).font(MacFont.mono(9.5)).tracking(1)
            .foregroundColor(b == "PRØVE" ? Color.white : t.calText(c))
            .padding(.horizontal, 7).frame(height: 20)
            .background(Capsule().fill(b == "PRØVE" ? t.red : t.calTint(c, 0.16)))
    }
}

/// Arket for et trekk (erstatter Når/Sted/Varsel/Slett i MacDetailSheet).
struct MacAbDetail42: View {
    @Environment(\.mk) private var t
    let e: KalEvent

    var body: some View {
        let x: KalAb42Info = e.ab42 ?? KalAb42Info()
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                MacAbLogo42(e: e, size: 40)
                VStack(alignment: .leading, spacing: 4) {
                    Text(e.kind == "trial" ? e.title : KalAb42.short(e)).font(MacFont.serif(24)).foregroundColor(t.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    MacAbBadge42(e: e)
                }
                Spacer(minLength: 0)
                let amt: String = KalAb42.amountText(e)
                if !amt.isEmpty { Text(amt).font(MacFont.mono(20)).foregroundColor(t.ink).textSelection(.enabled) }
            }
            VStack(spacing: 0) {
                MacInfoRow(label: e.kind == "trial" ? "Prøveperioden slutter" : "Trekkdato", value: KalD.cap(KalD.fd(KalD.date(e.day))), top: false)
                if !x.account.isEmpty { MacInfoRow(label: "Konto", value: x.account, top: true) }
                MacInfoRow(label: "Intervall", value: KalAb42.intervalText(e), top: true)
                if KalD.valid(x.next) && x.next != e.day {
                    MacInfoRow(label: "Neste trekk", value: KalD.cap(KalD.fd(KalD.date(x.next))), top: true)
                }
                if !x.cancelled.isEmpty { MacInfoRow(label: "Status", value: x.cancelled, top: true) }
            }
            .padding(.horizontal, 14)
            .background(RoundedRectangle(cornerRadius: 16).fill(t.card))
            HStack(spacing: 8) {
                MacPill(title: "Åpne i Finans ›") {
                    if let u = KalAb42.webURL() { _ = NSWorkspace.shared.open(u) }
                }
                if let u = URL(string: x.cancelUrl), !x.cancelUrl.isEmpty, x.cancelled.isEmpty {
                    MacPill(title: "Si opp …", filled: false) { _ = NSWorkspace.shared.open(u) }
                }
                Spacer()
            }
            Text("Endres i Finans → Abonnementer").font(MacFont.ui(12)).foregroundColor(t.mut)
        }
    }
}

enum MacAbAsk42 {
    /// «Hva trekkes denne uka?» / «Når trekkes Netflix?» – hurtigvei (KalAb42.answer), også når kalenderen er skjult.
    @MainActor static func answer(_ ql: String) -> MacAnswer? {
        let st: MacStore = MacStore.shared
        guard let ab = KalAb42.answer(ql, events: st.upcoming(limit: 400, includeHidden: true), today: KalD.todayKey()) else { return nil }
        var a: MacAnswer = MacAnswer(steps: ab.steps)
        a.text = ab.text
        a.cards = ab.cards
        return a
    }
}
