import SwiftUI
import UIKit

/* ---------------- Prompt 51 (MEDCTL51): fjernkontroll i Avspilling › Spilles nå ----------------
 Server: GET /api/medctl51/now → {items:[{id, title, state, canControl, controls:[playpause|stop|previous|next|seek|volume], volume,
 mine, controlText}]} og POST /api/medctl51/sessions/:id/:action (play|pause|toggle|stop|next|previous|seek {offset|position}|volume {volume}).
 Serveren avgjør hvem som kan styre hva (egne avspillinger, admin alle) og har rate limit; appen viser bare knappene i «controls».
 id-ene er de samme som i /api/playback/sessions, så knappene legges under kortet i Playback44SessionCard. Eldre server (404): ingen knapper. */

struct MediaCtl51Item: Hashable {
    var id: String
    var title: String = ""
    var paused: Bool = false
    var canControl: Bool = false
    var controls: [String] = []
    var volume: Double? = nil
    var mine: Bool = false
    var note: String = ""

    static func from(_ r: [String: Any]) -> MediaCtl51Item? {
        guard let id = JS.str(r, "id"), !id.isEmpty else { return nil }
        var x: MediaCtl51Item = MediaCtl51Item(id: id)
        x.title = JS.str(r, "title") ?? ""
        x.paused = JS.str(r, "state") == "paused"
        x.canControl = JS.bool(r, "canControl") ?? false
        x.controls = x.canControl ? JS.strings(r, "controls") : []
        x.volume = JS.num(r, "volume")
        x.mine = JS.bool(r, "mine") ?? false
        x.note = JS.str(r, "controlText") ?? ""
        return x
    }
}

@MainActor
@Observable
final class MediaCtl51 {
    static let shared = MediaCtl51()

    var items: [String: MediaCtl51Item] = [:]
    var busy: Set<String> = []
    var notes: [String: String] = [:]
    @ObservationIgnored private var at: Date = .distantPast
    @ObservationIgnored private var missing: Bool = false

    /// Henter kontrolltilstanden (maks hvert 4. sekund uten force).
    func load(_ store: Store, force: Bool = false) async {
        if missing { return }
        if !force && Date().timeIntervalSince(at) < 4 { return }
        at = Date()
        do {
            let d: Data = try await Media46.shared.call(store, "GET", "/medctl51/now", timeout: 12)
            let o: [String: Any] = JS.obj(d)
            var next: [String: MediaCtl51Item] = [:]
            for r in JS.list(o, "items") {
                if let x = MediaCtl51Item.from(r) { next[x.id] = x }
            }
            items = next
        } catch let e as APIError where e.status == 404 {
            missing = true
        } catch {
            // Uten nett: behold det vi har.
        }
    }

    func send(_ store: Store, _ id: String, _ action: String, _ body: [String: Any] = [:]) async {
        if busy.contains(id) { return }
        busy.insert(id)
        let ok: CharacterSet = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_.:"))
        let enc: String = id.addingPercentEncoding(withAllowedCharacters: ok) ?? id
        do {
            let d: Data = try await Media46.shared.call(store, "POST", "/medctl51/sessions/" + enc + "/" + action, json: body, timeout: 12)
            let o: [String: Any] = JS.obj(d)
            if let r = JS.dict(o, "item"), let x = MediaCtl51Item.from(r) { items[id] = x } else { items[id] = nil }
            notes[id] = JS.str(o, "message") ?? "OK"
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        } catch let e as APIError {
            notes[id] = e.status == 0 ? "Fikk ikke kontakt med serveren." : e.message
        } catch {
            notes[id] = error.localizedDescription
        }
        busy.remove(id)
        try? await Task.sleep(nanoseconds: 2_500_000_000)
        notes[id] = nil
        await load(store, force: true)
    }
}

/// Knapperaden under et kort i Spilles nå.
struct MediaCtl51Bar: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let id: String
    @MainActor private var c: MediaCtl51 { MediaCtl51.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let x = c.items[id] {
                if x.canControl {
                    MediaCtl51Row(x: x)
                } else if !x.note.isEmpty {
                    Text(x.note).font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                }
            }
            if let n = c.notes[id] {
                Text(n).font(PF.ui(12, .semibold)).foregroundStyle(p.ink).accessibilityAddTraits(.updatesFrequently)
            }
        }
        .task(id: id) { await c.load(store) }
    }
}

struct MediaCtl51Row: View {
    @Environment(Store.self) private var store
    let x: MediaCtl51Item
    @MainActor private var c: MediaCtl51 { MediaCtl51.shared }

    var body: some View {
        HStack(spacing: 6) {
            if x.controls.contains("previous") { btn("backward.end.fill", "Forrige", "previous") }
            if x.controls.contains("seek") { btn("gobackward.30", "Spol 30 sekunder tilbake", "seek", ["offset": -30_000]) }
            if x.controls.contains("playpause") { btn(x.paused ? "play.fill" : "pause.fill", x.paused ? "Spill av" : "Pause", "toggle") }
            if x.controls.contains("seek") { btn("goforward.30", "Spol 30 sekunder frem", "seek", ["offset": 30_000]) }
            if x.controls.contains("next") { btn("forward.end.fill", "Neste", "next") }
            if x.controls.contains("stop") { btn("stop.fill", "Stopp", "stop") }
        }
        .disabled(c.busy.contains(x.id))
    }

    private func btn(_ icon: String, _ label: String, _ action: String, _ args: [String: Any] = [:]) -> some View {
        MediaCtl51Button(icon: icon, label: label) {
            let id: String = x.id
            Task { await MediaCtl51.shared.send(store, id, action, args) }
        }
    }
}

struct MediaCtl51Button: View {
    @Environment(\.paper) private var p
    let icon: String
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: icon).font(.system(size: 15, weight: .semibold)).foregroundStyle(p.ink)
                .frame(minWidth: 44, minHeight: 44)
                .background(p.line.opacity(0.35), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}
