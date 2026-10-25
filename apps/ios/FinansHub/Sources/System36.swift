import SwiftUI
import UIKit

/* ---------------- Prompt 36: System → Oppdatering – Sherlock-Glimt, snekker-Glimt og tidligere versjoner ----------------
   Fasit: design/Mobil Papir App.dc.html (Nordlys-siden, Hjem- og Innstillinger-banneret: sherlock(), carp(), up.hist) og
   prompts/prompt-36-pakke/claude-code-system-oppdatering-nordlys.md.
   · «Se etter» → Glimt i Sherlock-drakt flyr inn i hero-kortet (52 pt, shFlyM 3,6 s), leter med forstørrelsesglasset og sier
     «Elementært! Du har siste versjon.» eller «Aha! Jeg fant Nordlys 4.28.», så flyr den ut. Lett haptikk ved trykk,
     dobbelt tikk når resultatet kommer. «Reduser bevegelse»: ingen flyging, figuren toner inn og ut ved knappen.
   · Mens oppdateringen kjører står Glimt som snekker oppå fremdriftslinja ved enden av fyllet og hamrer. Haptikk hvert 25 %.
   · TIDLIGERE VERSJONER: GET /api/system/changelog?limit=20&before= → {items:[{version, date, notes[], installedAt?, failed?}],
     more}. Én åpen om gangen, «Vis flere» henter neste side. Mangler endepunktet (eldre server), vises ikke seksjonen.
   · Endringsnotatene til den nye versjonen: finnes de ikke i /api/system/version, brukes oppføringen med samme versjon fra
     changelog (så «Ingen endringsnotater» bare vises når serveren virkelig ikke har noen). */

@MainActor
@Observable
final class System36Model {
    static let shared = System36Model()

    struct Item: Identifiable, Equatable {
        let version: String
        let date: String
        let notes: [String]
        let installedAt: String
        let failed: Bool
        let commit: String
        var id: String { version }
    }

    /// Sherlock-runden: start, og om søket fortsatt «pågår» (knappen viser «Ser etter …» i 2,6 s).
    var sherStart: Date? = nil
    var searching: Bool = false
    var sherTick: Int = 0

    var items: [Item] = []
    var more: Bool = false
    var openVersion: String = ""
    var loadingHistory: Bool = false
    var historyMissing: Bool = false
    @ObservationIgnored private var historyFor: String = "-"

    /* ---------- Sherlock ---------- */

    func sherlock(_ store: Store) {
        let u: Update30Model = Update30Model.shared
        if searching || u.phase == .run { return }
        Haptics.shared.tap()
        searching = true
        sherTick += 1
        let tick: Int = sherTick
        sherStart = Date()
        u.check(store)
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 2_600_000_000)
            if System36Model.shared.sherTick != tick { return }
            System36Model.shared.searching = false
            Haptic30.double()
            try? await Task.sleep(nanoseconds: 1_100_000_000)
            if System36Model.shared.sherTick != tick { return }
            System36Model.shared.sherStart = nil
        }
    }

    /* ---------- Tidligere versjoner ---------- */

    func loadHistory(_ store: Store, force: Bool = false) async {
        let key: String = (store.account?.id ?? "") + "|" + Update30Model.shared.latest
        if !force && historyFor == key && !items.isEmpty { return }
        historyFor = key
        loadingHistory = true
        defer { loadingHistory = false }
        let api: API = store.api
        do {
            let d: Data = try await api.callAt("/api", "GET", "/system/changelog?limit=20", timeout: 20)
            historyMissing = false
            let parsed: ([Item], Bool) = System36Model.parse(d)
            items = parsed.0
            more = parsed.1
            fillNotes()
        } catch let e as APIError {
            if e.status == 404 || e.status == 405 { historyMissing = true }
        } catch {}
    }

    func loadMore(_ store: Store) async {
        guard let last = items.last, !loadingHistory else { return }
        loadingHistory = true
        defer { loadingHistory = false }
        let api: API = store.api
        let enc: String = last.version.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? last.version
        guard let d = try? await api.callAt("/api", "GET", "/system/changelog?limit=20&before=" + enc, timeout: 20) else { return }
        let parsed: ([Item], Bool) = System36Model.parse(d)
        let known: Set<String> = Set(items.map { $0.version })
        items += parsed.0.filter { !known.contains($0.version) }
        more = parsed.1 && !parsed.0.isEmpty
    }

    /// Den nye versjonen mangler notater i /system/version: bruk changelog-oppføringen med samme versjon.
    private func fillNotes() {
        let u: Update30Model = Update30Model.shared
        if !u.notes.isEmpty { return }
        let v: String = u.latest.isEmpty ? u.current : u.latest
        if let it = items.first(where: { System36Model.same($0.version, v) }), !it.notes.isEmpty {
            u.notes = Array(it.notes.prefix(12))
        }
    }

    /// Listen under «NYTT I»: den nyeste (den som vises over) tas ikke med.
    func previous(_ shown: String) -> [Item] {
        items.filter { !System36Model.same($0.version, shown) }
    }

    func toggle(_ v: String) {
        Haptics.shared.select()
        withAnimation(.easeInOut(duration: 0.22)) { openVersion = openVersion == v ? "" : v }
    }

    nonisolated static func same(_ a: String, _ b: String) -> Bool {
        let x: String = a.lowercased().replacingOccurrences(of: "v", with: "")
        let y: String = b.lowercased().replacingOccurrences(of: "v", with: "")
        return !x.isEmpty && x == y
    }

    nonisolated static func parse(_ d: Data) -> ([Item], Bool) {
        let any: Any? = try? JSONSerialization.jsonObject(with: d)
        var rows: [[String: Any]] = []
        var more: Bool = false
        if let arr = any as? [Any] {
            rows = arr.compactMap { $0 as? [String: Any] }
        } else if let o = any as? [String: Any] {
            rows = JS.list(o, "items")
            if rows.isEmpty { rows = JS.list(o, "versions") }
            more = JS.bool(o, "more") ?? false
        }
        var out: [Item] = []
        for r in rows {
            guard let v = JS.str(r, "version"), !v.isEmpty else { continue }
            let notes: [String] = Update30Model.cleanNotes(JS.strings(r, "notes"))
            let item: Item = Item(version: v, date: JS.str(r, "date") ?? "", notes: notes,
                                  installedAt: JS.str(r, "installedAt") ?? "", failed: JS.bool(r, "failed") ?? false,
                                  commit: String((JS.str(r, "commit") ?? "").prefix(7)))
            out.append(item)
        }
        return (out, more)
    }

    /// «2026-10-17» / «17.10.2026» → «17.10.2026».
    nonisolated static func day(_ s: String) -> String {
        let t: String = String(s.prefix(10))
        let ps: [String] = t.split(separator: "-").map { String($0) }
        if ps.count == 3 { return ps[2] + "." + ps[1] + "." + ps[0] }
        return t
    }

    /// installedAt (ISO) → «Installert 19.10 kl. 21.40».
    nonisolated static func installed(_ s: String) -> String {
        guard let d = JS.date(s) else { return "" }
        return "Installert " + JS.fmt(d, "dd.MM") + " kl. " + JS.fmt(d, "HH.mm")
    }
}

/* ---------- Sherlock i hero-kortet ---------- */

/// Legges som overlegg i hero-kortet (System31Hero). Holder seg i høyre halvdel og tar ikke imot trykk.
struct System36SherlockLayer: View {
    @Environment(\.accessibilityReduceMotion) private var reduce
    @MainActor private var m: System36Model { System36Model.shared }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            if let start = m.sherStart {
                TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { (ctx: TimelineViewDefaultContext) in
                    System36SherlockFly(e: ctx.date.timeIntervalSince(start), t: ctx.date.timeIntervalSinceReferenceDate, reduce: reduce)
                }
                .padding(.trailing, 62).padding(.top, 70)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// Ett bilde av flyturen (shFlyM): e = sekunder siden start (0 … 3,6).
struct System36SherlockFly: View {
    @MainActor private var u: Update30Model { Update30Model.shared }
    @MainActor private var g: Glimt35Model { Glimt35Model.shared }
    let e: Double
    let t: Double
    let reduce: Bool

    private static let S: CGFloat = 52

    var body: some View {
        let p: Double = Swift.min(1, Swift.max(0, e / 3.6))
        let x: Double = reduce ? 0 : G36Anim.kf(p, [(0, 200), (0.3, 0), (0.4, -20), (0.54, -110), (0.68, -60), (0.8, -10), (0.9, -10), (1, 220)])
        let y: Double = reduce ? 0 : G36Anim.kf(p, [(0, -220), (0.3, 0), (0.4, 8), (0.54, -6), (0.68, 16), (0.8, 0), (0.9, 0), (1, -240)])
        let r: Double = reduce ? 0 : G36Anim.kf(p, [(0, -28), (0.3, 8), (0.4, -4), (0.54, -8), (0.68, 5), (0.8, 0), (0.9, 0), (1, 24)])
        let s: Double = reduce ? 1 : G36Anim.kf(p, [(0, 0.45), (0.3, 1), (0.9, 1), (1, 0.45)])
        let op: Double = reduce ? G36Anim.kf(p, [(0, 0), (0.12, 1), (0.9, 1), (1, 0)]) : G36Anim.kf(p, [(0, 0), (0.12, 1), (0.9, 1), (1, 0)])
        let bob: Double = reduce ? 0 : -6 * G36Anim.kf(G36Anim.loop(t, 0.9), [(0, 0), (0.5, 1), (1, 0)])
        let talkOp: Double = G36Anim.kf(p, [(0, 0), (0.68, 0), (0.74, 1), (0.92, 1), (1, 0)])
        ZStack(alignment: .topTrailing) {
            G36Sherlock(S: System36SherlockFly.S, t: t, still: reduce) {
                Glimt35Fig(id: g.cfg.host, size: System36SherlockFly.S, mood: .talk, t: t, still: reduce)
            }
            .offset(y: CGFloat(bob))
            System36SherBubble(text: bubble)
                .opacity(talkOp)
                .offset(x: -System36SherlockFly.S * 1.2, y: -System36SherlockFly.S * 0.2 + CGFloat(6 * (1 - talkOp)))
                .fixedSize()
        }
        .frame(width: System36SherlockFly.S, height: System36SherlockFly.S * 1.1, alignment: .topTrailing)
        .scaleEffect(CGFloat(s))
        .rotationEffect(.degrees(r))
        .offset(x: CGFloat(x), y: CGFloat(y))
        .opacity(op)
    }

    private var bubble: String {
        if u.phase == .avail || u.phase == .failed {
            return "Aha! Jeg fant Nordlys " + System31Hero.big(u) + "."
        }
        return "Elementært! Du har siste versjon."
    }
}

struct System36SherBubble: View {
    let text: String

    var body: some View {
        Text(text).font(PF.ui(12.5, .bold)).foregroundStyle(Color(hex: "#1b1a17")).lineLimit(1)
            .padding(.horizontal, 12).padding(.vertical, 8)
            .background(Color.white, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .shadow(color: Color.black.opacity(0.35), radius: 12, y: 10)
    }
}

/* ---------- Snekker på fremdriftslinja ---------- */

/// Fremdriftslinja med snekker-Glimt som står på enden av fyllet (left = pct, holdt innenfor kortet).
/// Linja får S·1,1 + 10 pt luft over seg, så figuren ikke dekker teksten.
struct Carp36Track: View {
    @Environment(\.accessibilityReduceMotion) private var reduce
    @MainActor private var g: Glimt35Model { Glimt35Model.shared }
    let pct: Int
    let S: CGFloat
    let track: Color
    let fill: Color

    var body: some View {
        GeometryReader { (geo: GeometryProxy) in
            let w: CGFloat = geo.size.width
            let fw: CGFloat = Swift.max(6, w * CGFloat(Swift.max(0, Swift.min(100, pct))) / 100)
            let lo: CGFloat = S * 0.6
            let hi: CGFloat = Swift.max(lo, w - S * 1.1)
            let cx: CGFloat = Swift.min(hi, Swift.max(lo, fw))
            ZStack(alignment: .bottomLeading) {
                Capsule().fill(track).frame(width: w, height: 6)
                Capsule().fill(fill).frame(width: fw, height: 6)
                Carp36Fig(S: S, host: g.cfg.host, reduce: reduce)
                    .offset(x: cx - S * 0.5, y: -5)
            }
            .frame(width: w, height: geo.size.height, alignment: .bottomLeading)
        }
        .frame(height: 6 + S * 1.1 + 10)
        .animation(.easeOut(duration: 0.4), value: pct)
        .onChange(of: pct / 25) { (old: Int, new: Int) in
            if new > old { Haptics.shared.select() }
        }
        .accessibilityElement()
        .accessibilityLabel("Oppdaterer, \(pct) prosent")
    }
}

struct Carp36Fig: View {
    let S: CGFloat
    let host: String
    let reduce: Bool

    var body: some View {
        Group {
            if reduce {
                G36Carpenter(S: S, t: 0, still: true) { Glimt35Fig(id: host, size: S, mood: .idle, still: true) }
            } else {
                TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { (ctx: TimelineViewDefaultContext) in
                    let t: Double = ctx.date.timeIntervalSinceReferenceDate
                    G36Carpenter(S: S, t: t) { Glimt35Fig(id: host, size: S, mood: .idle, t: t) }
                }
            }
        }
        .frame(width: S, height: S * 1.1, alignment: .topLeading)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/* ---------- TIDLIGERE VERSJONER ---------- */

struct System36History: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: System36Model { System36Model.shared }
    @MainActor private var u: Update30Model { Update30Model.shared }

    var body: some View {
        let shown: String = u.latest.isEmpty ? u.current : u.latest
        let list: [System36Model.Item] = m.previous(shown)
        VStack(alignment: .leading, spacing: 8) {
            if !m.historyMissing && (!list.isEmpty || m.loadingHistory) {
                Text("TIDLIGERE VERSJONER").font(PF.mono(11)).tracking(1.2).foregroundStyle(p.mut)
                    .padding(.top, 14).padding(.leading, 4)
                    .hl34("hist", radius: 10)
                VStack(spacing: 0) {
                    ForEach(Array(list.enumerated()), id: \.element.id) { (pair: (offset: Int, element: System36Model.Item)) in
                        if pair.offset > 0 { Rectangle().fill(p.line).frame(height: 1) }
                        System36HistoryRow(item: pair.element)
                    }
                    if m.loadingHistory && list.isEmpty {
                        Text("Henter …").font(PF.ui(13)).foregroundStyle(p.mut).frame(maxWidth: .infinity, minHeight: 52)
                    }
                }
                .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                if m.more {
                    Button { Task { await m.loadMore(store) } } label: {
                        Text(m.loadingHistory ? "Henter …" : "Vis flere").font(PF.ui(13.5, .bold)).foregroundStyle(p.ink)
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .task(id: shown) { await m.loadHistory(store) }
    }
}

struct System36HistoryRow: View {
    @Environment(\.paper) private var p
    @MainActor private var m: System36Model { System36Model.shared }
    let item: System36Model.Item

    var body: some View {
        let open: Bool = m.openVersion == item.version
        VStack(alignment: .leading, spacing: 0) {
            Button { m.toggle(item.version) } label: {
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Nordlys " + item.version).font(PF.mono(14)).foregroundStyle(p.ink)
                        Text(sub).font(PF.ui(12.5)).foregroundStyle(item.failed ? Color(hex: "#b23a2a") : p.mut).lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Image(systemName: "chevron.right").font(.dyn51(size: 12, weight: .semibold)).foregroundStyle(p.mut)
                        .rotationEffect(.degrees(open ? 90 : 0))
                }
                .padding(.horizontal, 14).frame(minHeight: 52)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if open {
                VStack(alignment: .leading, spacing: 6) {
                    if item.notes.isEmpty {
                        Text("Ingen endringsnotater for denne versjonen.").font(PF.ui(13)).foregroundStyle(p.mut)
                    }
                    ForEach(Array(item.notes.enumerated()), id: \.offset) { (pair: (offset: Int, element: String)) in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text("•").foregroundStyle(p.lab)
                            Text(pair.element).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                        }
                        .font(PF.ui(13.5))
                    }
                }
                .padding(.horizontal, 14).padding(.bottom, 14)
                .transition(.opacity)
            }
        }
    }

    /// «17.10.2026 · 3 endringer · Installert 19.10 kl. 21.40» / «… · Feilet».
    private var sub: String {
        var parts: [String] = []
        let d: String = System36Model.day(item.date)
        if !d.isEmpty { parts.append(d) }
        let n: Int = item.notes.count
        parts.append(n == 1 ? "1 endring" : "\(n) endringer")
        if item.failed {
            parts.append("Feilet")
        } else {
            let i: String = System36Model.installed(item.installedAt)
            if !i.isEmpty { parts.append(i) }
        }
        return parts.joined(separator: " · ")
    }
}

/// «Tidligere versjoner ›» nederst i «Hva er nytt» i banneret: åpner Nordlys-siden.
struct System36HistoryLink: View {
    @Environment(\.paper) private var p

    var body: some View {
        Button {
            System31Model.shared.show()
        } label: {
            Text("Tidligere versjoner ›").font(PF.ui(12.5, .bold)).foregroundStyle(p.lab)
                .frame(minHeight: 32).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
