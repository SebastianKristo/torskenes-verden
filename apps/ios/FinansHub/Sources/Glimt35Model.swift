import SwiftUI
import UIKit
import AVFoundation
import WidgetKit

/* ---------------- Prompt 35: Glimt-innstillinger (per bruker) og opplesning ----------------
   prompts/prompt-35-pakke/claude-code-innst-glimt.md + claude-code-glimt-brief.md («Glimt snakker», «Nesten menneskelige stemmer»).
   Innstillinger: GET/PUT /api/glimt/settings (delvis PUT, per bruker). Eldre server: /api/brief/settings (aliaset).
   ⚙ i briefen og Innstillinger → GLIMT → Glimt er samme data. Endringer vises med en gang og legges i App Group (widgetene).
   Opplesning: POST /api/tts {text, character, voice, rate, lang} → audio/mpeg (X-TTS-Engine, X-TTS-Cache). Nøklene ligger på
   serveren (AI-kontroll), aldri i appen. 503 {fallback:'browser'} eller feil → systemstemmen (AVSpeechSynthesizer, nb-NO / en-GB).
   Lyden spilles med AVPlayer i kategorien .ambient (følger lydløs-bryteren), og stopper ved Hopp over, Ferdig, når appen går i
   bakgrunnen og ved avbrudd (telefonsamtale). */

enum Glimt35Net {
    /// Kall mot serveren med svarhodene (for /api/tts).
    @MainActor static func request(_ store: Store, _ method: String, _ path: String, json: [String: Any]?, timeout: TimeInterval = 30) async throws -> (Data, HTTPURLResponse) {
        let base: String = store.api.base.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: base + path) else { throw APIError(message: "Ugyldig serveradresse", status: 0) }
        var r: URLRequest = URLRequest(url: url)
        r.httpMethod = method
        r.timeoutInterval = timeout
        if let t = store.api.token { r.setValue("Bearer " + t, forHTTPHeaderField: "Authorization") }
        if let json {
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
            r.httpBody = try JSONSerialization.data(withJSONObject: json)
        }
        let pair: (Data, URLResponse) = try await URLSession.shared.data(for: r)
        guard let h = pair.1 as? HTTPURLResponse else { throw APIError(message: "Serveren svarte ikke", status: 0) }
        return (pair.0, h)
    }
}

@MainActor
@Observable
final class Glimt35Model {
    static let shared = Glimt35Model()

    var cfg: Glimt35Cfg = Glimt35Cfg.cached ?? Glimt35Cfg()
    var loaded: Bool = false
    /// Serveren mangler /api/glimt/settings (bruker /api/brief/settings).
    var legacy: Bool = false
    var flashText: String = ""
    /// Innstillinger → GLIMT → Glimt (fullskjerm med Ferdig).
    var showPage: Bool = false
    /// Tillegget i briefen (nyheter med bilder, prøver, guide, vert).
    var extra: Brief35Extra = Brief35Extra.cached
    /// Figuren som nettopp ble valgt (glad + «Hei! Nå er jeg din Glimt.»).
    var greeted: String = ""
    @ObservationIgnored private var greetTask: Task<Void, Never>? = nil
    @ObservationIgnored private var flashTask: Task<Void, Never>? = nil

    func load(_ store: Store) async {
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/glimt/settings", timeout: 15)
            legacy = false
            if let c = Glimt35Cfg.parse(d) { apply(c) }
        } catch let e as APIError {
            if e.status == 404 {
                legacy = true
                if let d = try? await store.api.callAt("/api", "GET", "/brief/settings", timeout: 15), let c = Glimt35Cfg.parse(d) { apply(c) }
            }
        } catch {
            // Uten nett: behold det som ligger i App Group.
        }
        loaded = true
    }

    private func apply(_ c: Glimt35Cfg) {
        var next: Glimt35Cfg = c
        // Motorene kommer bare fra GET; behold dem når PUT-svaret ikke har dem.
        if next.engines.isEmpty { next.engines = cfg.engines }
        // Prompt 39: eldre server uten briefGlimt: behold valget på enheten.
        if !next.briefGlimtSet { next.briefGlimt = cfg.briefGlimt }
        // Prompt 40: eldre server uten julemodus: behold valget på enheten.
        if !next.julSet {
            next.jul = cfg.jul
            next.julPhase = cfg.julPhase
            next.snow = cfg.snow
            next.julSound = cfg.julSound
        }
        cfg = next
        persist()
    }

    private func persist() {
        Glimt35Cfg.store(cfg)
        Brief34Model.shared.autoTour = cfg.guide
        // Prompt 40: julemodus til App Group + NotificationCenter (alle åpne figurer) + alle widgets på hjemskjermen.
        if Glimt40Jul.save(mode: cfg.jul, phase: cfg.julPhase, snow: cfg.snow, sound: cfg.julSound) {
            WidgetCenter.shared.reloadAllTimelines()
        } else {
            WidgetCenter.shared.reloadTimelines(ofKind: Brief34.widgetKind)
        }
    }

    /// Endrer lokalt med en gang og sender bare det som er endret (PUT er delvis).
    func change(_ patch: [String: Any], _ store: Store, _ mutate: (inout Glimt35Cfg) -> Void) {
        var c: Glimt35Cfg = cfg
        mutate(&c)
        cfg = c
        persist()
        Haptic34.light()
        let legacyNow: Bool = legacy
        let full: [String: Any] = c.json
        Task {
            do {
                let path: String = legacyNow ? "/brief/settings" : "/glimt/settings"
                let d: Data = try await store.api.callAt("/api", "PUT", path, json: legacyNow ? full : patch, timeout: 15)
                if let back = Glimt35Cfg.parse(d) { self.apply(back) }
            } catch let e as APIError {
                if e.status == 404 && !legacyNow {
                    self.legacy = true
                    _ = try? await store.api.callAt("/api", "PUT", "/brief/settings", json: full, timeout: 15)
                } else {
                    self.flash(e.message)
                }
            } catch {
                self.flash(error.localizedDescription)
            }
        }
    }

    func setBool(_ key: String, _ v: Bool, _ store: Store) {
        change([key: v], store) { (c: inout Glimt35Cfg) in
            switch key {
            case "friends": c.friends = v
            case "brief": c.brief = v
            case "readAloud": c.readAloud = v
            case "guide": c.guide = v
            case "briefGlimt": c.briefGlimt = v
            default: c.notify = v
            }
        }
        if key == "readAloud" {
            if v { Glimt35Voice.shared.say("Lyden er på. Jeg leser briefen for deg.", char: cfg.host, store, force: true) } else { Glimt35Voice.shared.stop() }
        }
    }

    func setSlot(_ k: String, _ v: Glimt35Slot, _ store: Store) {
        let one: [String: Any] = ["on": v.on, "at": v.at]
        let inner: [String: Any] = [k: one]
        let patch: [String: Any] = ["briefs": inner]
        change(patch, store) { (c: inout Glimt35Cfg) in c.setSlot(k, v) }
    }

    func setTts(_ key: String, _ v: String, _ store: Store) {
        let inner: [String: Any] = [key: v]
        change(["tts": inner], store) { (c: inout Glimt35Cfg) in
            switch key {
            case "engine": c.engine = v
            case "voice": c.voice = v
            case "rate": c.rate = v
            default: c.lang = v
            }
        }
    }

    /// Trykk i figurvelgeren: velg, bli glad og si «Hei! Nå er jeg din Glimt.» (Gris: «Nøff!»).
    func choose(_ id: String, _ store: Store) {
        change(["char": id], store) { (c: inout Glimt35Cfg) in c.char = id }
        greeted = id
        greetTask?.cancel()
        greetTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 2_600_000_000)
            if Task.isCancelled { return }
            self.greeted = ""
        }
        Glimt35Voice.shared.say(Glimt35Char.hello(id), char: id, store)
    }

    /// Nøkkel til stemmemotoren (bare admin; lagres på serveren som AI-kontroll → API og nøkler).
    func saveKey(_ engine: String, _ key: String, region: String, _ store: Store) {
        let v: String = key.trimmingCharacters(in: .whitespacesAndNewlines)
        if v.isEmpty { return }
        var body: [String: Any] = ["key": v]
        if engine == "azure" && !region.isEmpty { body["region"] = region }
        Haptic34.light()
        Task {
            do {
                _ = try await store.api.callAt("/api", "PUT", "/ai/keys/" + engine, json: body, timeout: 20)
                self.flash("Nøkkelen er lagret på serveren")
                await self.load(store)
            } catch let e as APIError {
                self.flash(e.status == 403 ? "Bare administrator kan endre nøkler" : e.message)
            } catch {
                self.flash(error.localizedDescription)
            }
        }
    }

    func flash(_ t: String) {
        flashText = t
        flashTask?.cancel()
        flashTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 2_400_000_000)
            if Task.isCancelled { return }
            self.flashText = ""
        }
    }

    /* ---------- Briefen ---------- */

    /// Leser tillegget (nyheter med bilder, prøver, guide) fra den bufrede briefen i App Group.
    func refreshExtra() {
        extra = Brief35Extra.cached
    }

    /// «✓ Jeg har avsluttet Viaplay»: POST /api/brief/trials/:id/done (fjerner påminnelsene).
    func trialDone(_ t: Brief35Trial, _ store: Store) {
        Haptic34.double()
        extra.trials.removeAll { $0.id == t.id }
        let id: String = t.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? t.id
        Task {
            do {
                _ = try await store.api.callAt("/api", "POST", "/brief/trials/" + id + "/done", json: [:], timeout: 15)
            } catch {
                // Eldre server: marker prøven som avsluttet i Subscription OS.
                _ = try? await store.api.call("PATCH", "/subscriptions/trials/" + id, json: ["status": "cancelled"])
            }
            store.flash(t.service + " er markert som avsluttet")
            await Trial31Model.shared.load(store.api)
        }
    }
}

/* ---------- Opplesning ---------- */

/// Varsler når systemstemmen er ferdig (AVSpeechSynthesizer).
final class Glimt35SpeechDelegate: NSObject, AVSpeechSynthesizerDelegate, @unchecked Sendable {
    var done: (() -> Void)? = nil

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        let d: (() -> Void)? = done
        DispatchQueue.main.async { d?() }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        let d: (() -> Void)? = done
        DispatchQueue.main.async { d?() }
    }
}

@MainActor
@Observable
final class Glimt35Voice {
    static let shared = Glimt35Voice()

    /// Figuren som snakker nå (nil = stille).
    var speaking: String? = nil
    /// Motoren som laget lyden (X-TTS-Engine), eller «system».
    var engineUsed: String = ""
    var error: String = ""

    @ObservationIgnored private var player: AVPlayer? = nil
    @ObservationIgnored private var endObserver: NSObjectProtocol? = nil
    private let synth: AVSpeechSynthesizer = AVSpeechSynthesizer()
    private let delegate: Glimt35SpeechDelegate = Glimt35SpeechDelegate()
    @ObservationIgnored private var cache: [String: URL] = [:]
    @ObservationIgnored private var token: Int = 0
    /// Venter på /api/tts (avbrutt systemstemme skal ikke skjule «snakker»-pillen imens).
    @ObservationIgnored private var fetching: Bool = false
    @ObservationIgnored private var observers: [NSObjectProtocol] = []

    init() {
        synth.delegate = delegate
        delegate.done = {
            MainActor.assumeIsolated { Glimt35Voice.shared.finished() }
        }
        let nc: NotificationCenter = NotificationCenter.default
        observers.append(nc.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { (_: Notification) in
            MainActor.assumeIsolated { Glimt35Voice.shared.stop() }
        })
        observers.append(nc.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { (_: Notification) in
            MainActor.assumeIsolated { Glimt35Voice.shared.stop() }
        })
    }

    static let voices: [(String, String, String, Double, Double)] = [
        ("nora", "Nora · rolig og varm", "Kvinne · voksen, rolig", 1, 1),
        ("henrik", "Henrik · lav og trygg", "Mann · dyp, avslappet", 0.9, 0.92),
        ("lys", "Lys · glad og lett", "Kvinne · ung, smilende", 1.15, 1.05),
    ]

    static func voiceName(_ id: String) -> String {
        let v: (String, String, String, Double, Double) = voices.first { $0.0 == id } ?? voices[0]
        return v.1.components(separatedBy: " · ").first ?? "Nora"
    }

    /// Leser opp teksten med figurens klang. force = også når «Les opp» er av (▶ Hør, slå på lyd).
    func say(_ text: String, char: String, _ store: Store, force: Bool = false) {
        let cfg: Glimt35Cfg = Glimt35Model.shared.cfg
        if !force && !cfg.readAloud { return }
        stop()
        let clean: String = text.replacingOccurrences(of: "**", with: "").trimmingCharacters(in: .whitespacesAndNewlines)
        if clean.isEmpty { return }
        token += 1
        let my: Int = token
        speaking = char
        error = ""
        if cfg.engine == "browser" {
            speakSystem(clean, char: char, cfg)
            return
        }
        let parts: [String] = [clean, char, cfg.engine, cfg.voice, cfg.rate, cfg.lang]
        let key: String = parts.joined(separator: "|")
        if let url = cache[key], FileManager.default.fileExists(atPath: url.path) {
            play(url)
            return
        }
        let body: [String: Any] = ["text": clean, "character": char, "voice": cfg.voice, "rate": cfg.rate, "lang": cfg.lang]
        fetching = true
        Task {
            defer { if my == self.token { self.fetching = false } }
            do {
                let res: (Data, HTTPURLResponse) = try await Glimt35Net.request(store, "POST", "/api/tts", json: body, timeout: 30)
                guard my == self.token else { return }
                let type: String = (res.1.value(forHTTPHeaderField: "Content-Type") ?? "").lowercased()
                let audio: Bool = type.contains("audio") || type.contains("mpeg") || (!type.contains("json") && res.0.count > 2000)
                if res.1.statusCode == 200 && audio {
                    let name: String = "glimt35-" + String(UInt(bitPattern: key.hashValue)) + ".mp3"
                    let url: URL = FileManager.default.temporaryDirectory.appendingPathComponent(name)
                    try res.0.write(to: url, options: .atomic)
                    self.cache[key] = url
                    self.engineUsed = res.1.value(forHTTPHeaderField: "X-TTS-Engine") ?? cfg.engine
                    self.play(url)
                } else {
                    let o: [String: Any] = JS.obj(res.0)
                    self.error = JS.str(o, "error") ?? ""
                    self.speakSystem(clean, char: char, cfg)
                }
            } catch {
                guard my == self.token else { return }
                self.speakSystem(clean, char: char, cfg)
            }
        }
    }

    private func activate() {
        let s: AVAudioSession = AVAudioSession.sharedInstance()
        // .ambient følger lydløs-bryteren og blander seg med annen lyd.
        try? s.setCategory(.ambient)
        try? s.setActive(true)
    }

    private func play(_ url: URL) {
        activate()
        let item: AVPlayerItem = AVPlayerItem(url: url)
        if let o = endObserver { NotificationCenter.default.removeObserver(o) }
        endObserver = NotificationCenter.default.addObserver(forName: AVPlayerItem.didPlayToEndTimeNotification, object: item, queue: .main) { (_: Notification) in
            MainActor.assumeIsolated { Glimt35Voice.shared.finished() }
        }
        let p: AVPlayer = AVPlayer(playerItem: item)
        player = p
        p.play()
    }

    private func speakSystem(_ text: String, char: String, _ cfg: Glimt35Cfg) {
        activate()
        engineUsed = "system"
        let u: AVSpeechUtterance = AVSpeechUtterance(string: text)
        u.voice = AVSpeechSynthesisVoice(language: cfg.lang == "en" ? "en-GB" : "nb-NO")
        let v: (String, String, String, Double, Double) = Glimt35Voice.voices.first { $0.0 == cfg.voice } ?? Glimt35Voice.voices[0]
        let cv: (Double, Double) = Glimt35Char.pitch(char)
        u.pitchMultiplier = Float(Swift.min(2, Swift.max(0.5, v.3 * cv.0)))
        let rate: Double = Double(AVSpeechUtteranceDefaultSpeechRate) * cfg.rateFactor * v.4 * cv.1
        u.rate = Float(Swift.min(Double(AVSpeechUtteranceMaximumSpeechRate), Swift.max(Double(AVSpeechUtteranceMinimumSpeechRate), rate)))
        synth.speak(u)
    }

    fileprivate func finished() {
        if fetching { return }
        if player != nil || !synth.isSpeaking { speaking = nil }
        player = nil
    }

    func stop() {
        token += 1
        fetching = false
        player?.pause()
        player = nil
        if synth.isSpeaking { synth.stopSpeaking(at: .immediate) }
        speaking = nil
    }
}
