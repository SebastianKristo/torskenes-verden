import SwiftUI
import WatchKit

/* ---------------- Prompt 51 (MEDCTL51): Spilles nå med fjernkontroll på Apple Watch ----------------
 GET /api/medctl51/now og POST /api/medctl51/sessions/:id/:action (toggle, next, previous, seek {offset}, stop).
 Serveren avgjør hvem som kan styre hva (egne avspillinger, admin alle) og har rate limit; klokka viser bare knappene i «controls».
 Bruker W51Store.call (samme innlogging og serveradresser som resten av klokka). */

struct W51Play: Hashable, Identifiable {
    var id: String
    var title: String
    var sub: String
    var paused: Bool
    var controls: [String]
    var note: String

    static func from(_ o: [String: Any]) -> W51Play? {
        guard let id = o["id"] as? String, !id.isEmpty else { return nil }
        let can: Bool = (o["canControl"] as? Bool) ?? false
        let ctl: [String] = can ? ((o["controls"] as? [Any]) ?? []).compactMap { $0 as? String } : []
        let parts: [String] = [o["user"] as? String, o["device"] as? String, o["remainingText"] as? String].compactMap { $0 }.filter { !$0.isEmpty }
        return W51Play(id: id, title: (o["title"] as? String) ?? "Ukjent", sub: parts.joined(separator: " · "),
                       paused: (o["state"] as? String) == "paused", controls: ctl, note: (o["controlText"] as? String) ?? "")
    }
}

@MainActor
@Observable
final class W51MediaStore {
    static let shared: W51MediaStore = W51MediaStore()

    var items: [W51Play] = []
    var loaded: Bool = false
    var busy: Bool = false
    var flash: String = ""

    func load() async {
        let r: W51Store.Reply = await W51Store.shared.call("GET", "/api/medctl51/now")
        loaded = true
        guard r.ok else {
            flash = r.status == 404 ? "Serveren har ikke mediekontroll ennå. Oppdater Homelab." : W51Store.err(r)
            return
        }
        items = ((r.obj["items"] as? [Any]) ?? []).compactMap { (x: Any) -> W51Play? in
            guard let o = x as? [String: Any] else { return nil }
            return W51Play.from(o)
        }
    }

    func send(_ p: W51Play, _ action: String, _ args: [String: Any] = [:]) async {
        if busy { return }
        busy = true
        defer { busy = false }
        let ok: CharacterSet = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_.:"))
        let enc: String = p.id.addingPercentEncoding(withAllowedCharacters: ok) ?? p.id
        let r: W51Store.Reply = await W51Store.shared.call("POST", "/api/medctl51/sessions/" + enc + "/" + action, args)
        guard r.ok else {
            flash = W51Store.err(r)
            WKInterfaceDevice.current().play(.failure)
            return
        }
        let o: [String: Any] = r.obj
        if let it = o["item"] as? [String: Any], let n = W51Play.from(it) {
            if let i = items.firstIndex(where: { $0.id == p.id }) { items[i] = n }
        } else {
            items.removeAll { $0.id == p.id }
        }
        flash = (o["message"] as? String) ?? "OK"
        WKInterfaceDevice.current().play(.click)
    }
}

struct W51MediaView: View {
    @MainActor private var media: W51MediaStore { W51MediaStore.shared }

    var body: some View {
        List {
            if media.items.isEmpty {
                Text(media.loaded ? (media.flash.isEmpty ? "Ingenting spilles nå." : media.flash) : "Henter …").font(.footnote)
            }
            ForEach(media.items) { (p: W51Play) in
                Section {
                    W51PlayButtons(play: p)
                } header: {
                    Text(p.title).lineLimit(2)
                } footer: {
                    if !p.sub.isEmpty { Text(p.sub) }
                }
            }
            if !media.items.isEmpty && !media.flash.isEmpty { Text(media.flash).font(.footnote) }
        }
        .navigationTitle("Spilles nå")
        .task {
            media.flash = ""
            await media.load()
        }
        .refreshable { await media.load() }
    }
}

struct W51PlayButtons: View {
    let play: W51Play
    @MainActor private var media: W51MediaStore { W51MediaStore.shared }

    var body: some View {
        if play.controls.isEmpty {
            Text(play.note.isEmpty ? "Kan ikke styres herfra." : play.note).font(.footnote).foregroundStyle(Color.secondary)
        }
        if play.controls.contains("playpause") {
            Button { Task { await media.send(play, "toggle") } } label: {
                Label(play.paused ? "Spill av" : "Pause", systemImage: play.paused ? "play.fill" : "pause.fill")
            }
            .disabled(media.busy)
        }
        if play.controls.contains("next") {
            Button { Task { await media.send(play, "next") } } label: { Label("Neste", systemImage: "forward.end.fill") }
                .disabled(media.busy)
        }
        if play.controls.contains("seek") {
            Button { Task { await media.send(play, "seek", ["offset": -30_000]) } } label: { Label("30 s tilbake", systemImage: "gobackward.30") }
                .disabled(media.busy)
        }
        if play.controls.contains("stop") {
            Button(role: .destructive) { Task { await media.send(play, "stop") } } label: { Label("Stopp", systemImage: "stop.fill") }
                .disabled(media.busy)
        }
    }
}
