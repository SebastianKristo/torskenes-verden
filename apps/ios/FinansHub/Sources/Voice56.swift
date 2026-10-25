import SwiftUI
import UIKit
import AVFoundation
import Speech

// Prompt 56 (IOS56): tale til tekst via serveren i Glimt-chatten og Glimt-søket på Hjem. Fasit: public/js/voice54.js.
// – Når serveren har en klar motor (GET /api/voice53/backends → minst én backend med available): AVAudioRecorder tar opp
//   AAC (.m4a, 16 kHz mono) til en temp-fil, som sendes til POST /api/voice53/transcribe (multipart: file, language=auto,
//   hint=nb). Teksten settes inn i skrivefeltet (sendes ikke), og «NB-Whisper (Mac mini) · norsk» vises kort etterpå.
// – Trykk = start, trykk igjen = stopp. Hold inne = snakk så lenge du holder (slipp = stopp). Maks 2 min, så stopper den selv.
//   «Lytter …» med lydbølge mens den tar opp, «Skriver ned …» mens serveren jobber, og Avbryt.
// – Uten motor på serveren (eller ved 503, avslått tale for brukeren eller uten nett): talegjenkjenningen på enheten som før
//   (ChatVoice27, SFSpeechRecognizer nb-NO). Er opptaket allerede gjort, gjøres samme fil om til tekst på enheten. 422 og 400
//   viser feilteksten fra serveren.
// – Innstilling: AI og tolkning → TALE TIL TEKST: «Serveren (anbefalt)» / «På enheten» (lagres lokalt, standard Serveren).
// – Lyden lagres aldri varig: temp-fila slettes rett etter sending (også ved feil og Avbryt), og går bare til Homelab-serveren.
// Scroll-lærdommen: knappen er en vanlig Button (trykk) med .simultaneousGesture(LongPressGesture(…).onEnded) for hold –
// ingen .onChanged/.updating og ingen drag-gester, så Hjem scroller som før. Slipp etter hold kommer som knappens vanlige trykk.
// Lukkene som kalles fra Speech-tråden lages i nonisolated hjelpere (som i Chat27Voice.swift), så de ikke arver @MainActor.

/// Det knappen trenger: sette inn teksten, vise feil og korte beskjeder, og talegjenkjenningen på enheten (reserven).
struct Voice56Ctx {
    let target: String
    let insert: (String) -> Void
    let error: (String) -> Void
    let note: (String) -> Void
    let device: (() -> Void)?
}

@MainActor
@Observable
final class Voice56 {
    static let shared = Voice56()

    nonisolated static let maxSecs: Double = 120
    nonisolated static let modeKey: String = "voice56_mode"

    /// "idle" | "starting" | "rec" | "busy"
    var phase: String = "idle"
    /// "chat" | "search"
    var target: String = ""
    /// Startet med hold inne: slipp stopper.
    var holdMode: Bool = false
    var secs: Int = 0
    /// Sju søyler (0–1) til lydbølgen.
    var levels: [CGFloat] = Array(repeating: 0.25, count: 7)
    /// Lagret lokalt: «Serveren (anbefalt)» (true, standard) eller «På enheten».
    var useServer: Bool = UserDefaults.standard.string(forKey: Voice56.modeKey) != "device"
    /// nil = ikke sjekket ennå.
    var ready: Bool? = nil
    var engineName: String = ""
    /// Siste beskjed for søket («NB-Whisper (Mac mini) · norsk» eller feil).
    var note: String = ""

    @ObservationIgnored private var readyAt: Date = .distantPast
    @ObservationIgnored private var recorder: AVAudioRecorder? = nil
    @ObservationIgnored private var fileURL: URL? = nil
    @ObservationIgnored private var started: Date = Date()
    @ObservationIgnored private var gen: Int = 0
    @ObservationIgnored private var job: Task<Void, Never>? = nil
    @ObservationIgnored private var ctx: Voice56Ctx? = nil
    @ObservationIgnored private var noteTask: Task<Void, Never>? = nil
    @ObservationIgnored private weak var store: Store? = nil

    /// Lytter eller skriver ned for dette feltet.
    func active(_ t: String) -> Bool { target == t && (phase == "rec" || phase == "busy") }

    func setServer(_ on: Bool) {
        useServer = on
        UserDefaults.standard.set(on ? "server" : "device", forKey: Voice56.modeKey)
        Haptics.shared.select()
    }

    /* ---------- Status fra serveren ---------- */

    @discardableResult
    func refresh(_ store: Store, force: Bool = false) async -> Bool {
        if !force, let r = ready, Date().timeIntervalSince(readyAt) < (r ? 60 : 30) { return r }
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/voice53/backends", timeout: 5)
            let obj: [String: Any]? = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any]
            let list: [[String: Any]] = (obj?["backends"] as? [[String: Any]]) ?? []
            let ok: [[String: Any]] = list.filter { ($0["available"] as? Bool) == true }
            let first: String = (ok.first?["engine_label"] as? String) ?? (ok.first?["label"] as? String) ?? ""
            engineName = (obj?["norwegian_engine"] as? String) ?? first
            ready = !ok.isEmpty
        } catch {
            ready = false
            engineName = ""
        }
        readyAt = Date()
        return ready ?? false
    }

    /* ---------- Knappen ---------- */

    /// Vanlig trykk (og slipp etter hold).
    func tap(_ c: Voice56Ctx, _ store: Store) {
        switch phase {
        case "rec":
            stop(cancel: false)
        case "starting":
            // Sluppet før opptaket rakk å starte (f.eks. mens iOS spør om mikrofonen) → trykk-modus.
            holdMode = false
        case "busy":
            return
        default:
            if ChatVoice27.shared.recording { c.device?(); return }
            begin(c, store, hold: false)
        }
    }

    /// Hold inne (LongPressGesture.onEnded): start bare når vi vet at serveren er klar – ellers blir slippet et vanlig trykk.
    func holdBegan(_ c: Voice56Ctx, _ store: Store) {
        guard phase == "idle", !ChatVoice27.shared.recording, useServer, ready == true else { return }
        begin(c, store, hold: true)
    }

    private func begin(_ c: Voice56Ctx, _ store: Store, hold: Bool) {
        ctx = c
        self.store = store
        target = c.target
        holdMode = hold
        phase = "starting"
        gen += 1
        let g: Int = gen
        Task {
            var ok: Bool = false
            if useServer { ok = await refresh(store) }
            if g != gen || phase != "starting" { return }
            if !ok {
                phase = "idle"
                if let d = c.device { d() } else { c.error("Tale til tekst er ikke tilgjengelig nå") }
                return
            }
            let mic: Bool = await AVAudioApplication.requestRecordPermission()
            if g != gen || phase != "starting" { return }
            guard mic else {
                phase = "idle"
                c.error("Gi Homelab tilgang til mikrofonen i Innstillinger → Personvern → Mikrofon")
                return
            }
            startRecorder(c)
        }
    }

    private func startRecorder(_ c: Voice56Ctx) {
        ChatVoice27.shared.stopSpeaking()
        let url: URL = FileManager.default.temporaryDirectory.appendingPathComponent("tale56-" + UUID().uuidString + ".m4a")
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 16000.0,
            AVNumberOfChannelsKey: 1,
            AVEncoderBitRateKey: 32000,
            AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue
        ]
        do {
            let session: AVAudioSession = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .default, options: [.duckOthers, .defaultToSpeaker])
            try session.setActive(true, options: .notifyOthersOnDeactivation)
            let r: AVAudioRecorder = try AVAudioRecorder(url: url, settings: settings)
            r.isMeteringEnabled = true
            guard r.record() else { throw NSError(domain: "Voice56", code: 1) }
            recorder = r
            fileURL = url
            started = Date()
            secs = 0
            phase = "rec"
            Haptics.shared.tap()
            meter(gen)
        } catch {
            Voice56.remove(url)
            phase = "idle"
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            c.error("Fikk ikke startet mikrofonen")
        }
    }

    /// Nivået til lydbølgen og tiden, ti ganger i sekundet. Stopper selv etter 2 min.
    private func meter(_ g: Int) {
        Task {
            while g == gen && phase == "rec" {
                try? await Task.sleep(nanoseconds: 100_000_000)
                if g != gen || phase != "rec" { return }
                guard let r = recorder else { return }
                r.updateMeters()
                let db: Float = r.averagePower(forChannel: 0)
                let lin: Float = powf(10, db / 20)
                push(Swift.min(1, lin * 6))
                let t: Double = Date().timeIntervalSince(started)
                secs = Int(t)
                if t >= Voice56.maxSecs { stop(cancel: false) }
            }
        }
    }

    private func push(_ lvl: Float) {
        var l: [CGFloat] = levels
        l.removeFirst()
        l.append(CGFloat(Swift.max(0.15, Swift.min(1, lvl))))
        levels = l
    }

    /// Stopp opptaket. cancel = Avbryt (ingenting sendes). Avbryt mens serveren skriver ned forkaster svaret.
    func stop(cancel: Bool) {
        if phase == "busy" {
            if cancel { gen += 1; job?.cancel(); job = nil; phase = "idle"; target = "" }
            return
        }
        if phase == "starting" { gen += 1; phase = "idle"; target = ""; return }
        guard phase == "rec" else { return }
        let ms: Double = Date().timeIntervalSince(started) * 1000
        recorder?.stop()
        recorder = nil
        levels = Array(repeating: 0.25, count: 7)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        Haptics.shared.tap()
        let url: URL? = fileURL
        fileURL = nil
        gen += 1
        if cancel || url == nil || ctx == nil {
            Voice56.remove(url)
            phase = "idle"
            target = ""
            return
        }
        let size: Int = Voice56.fileSize(url)
        if ms < 400 || size < 600 {
            Voice56.remove(url)
            phase = "idle"
            ctx?.error("For kort opptak – hold inne mens du snakker, eller trykk én gang for å starte.")
            target = ""
            return
        }
        guard let u = url, let c = ctx else { return }
        phase = "busy"
        let g: Int = gen
        job = Task { await self.send(u, c, g) }
    }

    func cancel() { stop(cancel: true) }

    /* ---------- Sending ---------- */

    private func send(_ url: URL, _ c: Voice56Ctx, _ g: Int) async {
        guard let store = self.store else { Voice56.remove(url); finish(g); return }
        let data: Data = (try? Data(contentsOf: url)) ?? Data()
        let parts: [API.Part] = [
            API.Part(name: "file", filename: "tale.m4a", mime: "audio/mp4", data: data),
            API.Part.text("language", "auto"),
            API.Part.text("hint", Voice56.hint)
        ]
        do {
            let d: Data = try await store.api.upload("/voice53/transcribe", parts: parts, prefix: "/api", timeout: 180)
            Voice56.remove(url)
            if g != gen { return }
            let obj: [String: Any] = ((try? JSONSerialization.jsonObject(with: d)) as? [String: Any]) ?? [:]
            let text: String = ((obj["text"] as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let engine: String = (obj["engine_label"] as? String) ?? (obj["engine"] as? String) ?? "Tale til tekst"
            if text.isEmpty {
                c.note("Hørte ingen ord · " + engine)
            } else {
                c.insert(text)
                var lang: String = (obj["language_label"] as? String) ?? (obj["language"] as? String) ?? ""
                if let det = obj["detected"] as? [String: Any], (det["source"] as? String) == "detected", !lang.isEmpty { lang += " (oppdaget)" }
                c.note(lang.isEmpty ? engine : engine + " · " + lang)
                Haptics.shared.success()
            }
            finish(g)
        } catch let e as APIError {
            if g != gen { Voice56.remove(url); return }
            if e.status == 422 || e.status == 400 || e.status == 413 {
                Voice56.remove(url)
                if e.status == 422 { ready = nil }
                c.error(e.message)
                finish(g)
                return
            }
            // 503 (ingen motor), 403 (avslått for brukeren), uten nett o.l.: stille reserve på enheten med samme opptak.
            ready = false
            readyAt = Date()
            let t: String? = await Voice56.deviceText(url)
            Voice56.remove(url)
            if g != gen { return }
            if let t, !t.isEmpty { c.insert(t); c.note("På enheten · norsk") } else { c.error(e.message) }
            finish(g)
        } catch {
            Voice56.remove(url)
            if g != gen { return }
            c.error("Tale til tekst feilet")
            finish(g)
        }
    }

    private func finish(_ g: Int) {
        if g != gen { return }
        phase = "idle"
        target = ""
        job = nil
    }

    /// Kort beskjed under søkefeltet (forsvinner etter 5 s).
    func show(_ t: String) {
        note = t
        noteTask?.cancel()
        noteTask = Task {
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            if !Task.isCancelled { self.note = "" }
        }
    }

    /// Appens språk som hint (appen er på norsk bokmål).
    nonisolated static var hint: String {
        (Locale.preferredLanguages.first ?? "nb").lowercased().hasPrefix("en") ? "en" : "nb"
    }

    nonisolated static func remove(_ url: URL?) {
        guard let url else { return }
        try? FileManager.default.removeItem(at: url)
    }

    nonisolated static func fileSize(_ url: URL?) -> Int {
        guard let url, let a = try? FileManager.default.attributesOfItem(atPath: url.path) else { return 0 }
        return (a[.size] as? NSNumber)?.intValue ?? 0
    }

    /// Reserven: samme opptak gjøres om til tekst med talegjenkjenningen på enheten (nb-NO).
    nonisolated static func deviceText(_ url: URL) async -> String? {
        let auth: SFSpeechRecognizerAuthorizationStatus = await withCheckedContinuation { (c: CheckedContinuation<SFSpeechRecognizerAuthorizationStatus, Never>) in
            SFSpeechRecognizer.requestAuthorization { s in c.resume(returning: s) }
        }
        guard auth == .authorized, let rec = SFSpeechRecognizer(locale: Locale(identifier: "nb-NO")), rec.isAvailable else { return nil }
        let req: SFSpeechURLRecognitionRequest = SFSpeechURLRecognitionRequest(url: url)
        req.shouldReportPartialResults = false
        let once: Voice56Once = Voice56Once()
        let text: String? = await withCheckedContinuation { (c: CheckedContinuation<String?, Never>) in
            _ = rec.recognitionTask(with: req, resultHandler: Voice56.urlHandler(once) { (t: String?) in c.resume(returning: t) })
        }
        _ = rec.isAvailable
        return text
    }

    nonisolated private static func urlHandler(_ once: Voice56Once, done: @escaping @Sendable (String?) -> Void) -> (SFSpeechRecognitionResult?, Error?) -> Void {
        return { (result: SFSpeechRecognitionResult?, error: Error?) in
            if let r = result, r.isFinal {
                if once.take() { done(r.bestTranscription.formattedString) }
                return
            }
            if error != nil, once.take() { done(nil) }
        }
    }
}

/// Sørger for at fortsettelsen bare gjenopptas én gang (Speech kan kalle tilbake flere ganger).
final class Voice56Once: @unchecked Sendable {
    private let lock: NSLock = NSLock()
    private var used: Bool = false

    func take() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        if used { return false }
        used = true
        return true
    }
}

/* ---------- Mikrofonknappen ---------- */

/// Trykk = start/stopp, hold inne = snakk så lenge du holder. Rød bakgrunn mens den lytter (server eller enhet).
struct Voice56Mic: View {
    @Environment(Store.self) private var store
    @MainActor private var v: Voice56 { Voice56.shared }
    @MainActor private var dev: ChatVoice27 { ChatVoice27.shared }
    let ctx: Voice56Ctx
    let ink: Color
    var size: CGFloat = 38
    var icon: CGFloat = 17
    var label: String = "Snakk"

    var body: some View {
        let on: Bool = v.active(ctx.target) || (dev.recording && ctx.device != nil)
        Button { press() } label: {
            Image(systemName: v.phase == "busy" && v.target == ctx.target ? "ellipsis" : "mic")
                .font(.dyn51(size: icon, weight: .semibold))
                .foregroundStyle(on ? Color.white : ink)
                .frame(width: size, height: size)
                .background(on ? Color(hex: "#b23a2a") : Color.clear, in: Circle())
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .simultaneousGesture(LongPressGesture(minimumDuration: 0.45, maximumDistance: 8).onEnded { _ in hold() })
        .accessibilityLabel(on ? "Stopp opptaket" : label)
        .accessibilityHint("Trykk for å starte og stoppe, eller hold inne mens du snakker")
        .task(id: store.account?.id ?? "") {
            if v.useServer { await v.refresh(store) }
        }
    }

    private func press() { v.tap(ctx, store) }

    private func hold() { v.holdBegan(ctx, store) }
}

/// Lydbølgen mens serveropptaket går.
struct Voice56Wave: View {
    @MainActor private var v: Voice56 { Voice56.shared }
    let color: Color

    var body: some View {
        HStack(spacing: 3) {
            ForEach(0..<7, id: \.self) { i in
                Capsule().fill(color).frame(width: 3, height: 4 + 18 * v.levels[i])
            }
        }
        .frame(height: 22)
        .animation(.easeOut(duration: 0.12), value: v.levels)
    }
}

/// «Lytter … 0:12 · slipp for å stoppe» med lydbølge, eller «Skriver ned …», og Avbryt.
struct Voice56Bar: View {
    @MainActor private var v: Voice56 { Voice56.shared }
    let ink: Color
    let mut: Color
    let font: (CGFloat, Font.Weight) -> Font

    var body: some View {
        HStack(spacing: 10) {
            if v.phase == "busy" {
                ProgressView().controlSize(.small).tint(ink)
                Text("Skriver ned …").font(font(15, .regular)).foregroundStyle(ink).lineLimit(1)
            } else {
                Circle().fill(Color(hex: "#b23a2a")).frame(width: 8, height: 8)
                Text("Lytter … " + clock).font(font(15, .regular)).foregroundStyle(ink).lineLimit(1).monospacedDigit()
                Text(v.holdMode ? "slipp for å stoppe" : "trykk igjen for å stoppe").font(font(12, .regular)).foregroundStyle(mut)
                    .lineLimit(1).minimumScaleFactor(0.8)
            }
            Spacer(minLength: 4)
            if v.phase == "rec" { Voice56Wave(color: Color(hex: "#b23a2a")) }
            Button { v.cancel() } label: {
                Text("Avbryt").font(font(13, .semibold)).foregroundStyle(mut)
                    .padding(.horizontal, 10).frame(height: 34).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 8).frame(minHeight: 40)
        .accessibilityElement(children: .contain)
    }

    private var clock: String {
        let s: Int = v.secs
        return String(s / 60) + ":" + (s % 60 < 10 ? "0" : "") + String(s % 60)
    }
}

/* ---------- Innstillinger → AI og tolkning → TALE TIL TEKST ---------- */

struct Voice56SettingsGroup: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var v: Voice56 { Voice56.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            PLabel(text: "Tale til tekst").padding(.leading, 4).padding(.top, 14)
            PCard(padding: 0) {
                VStack(spacing: 0) {
                    choice("Serveren (anbefalt)", serverSub, on: v.useServer) { v.setServer(true) }
                    Rectangle().fill(p.line).frame(height: 1)
                    choice("På enheten", "Apples talegjenkjenning på norsk", on: !v.useServer) { v.setServer(false) }
                }
            }
            Text("Gjelder mikrofonen i Chat og i søkefeltet på Hjem. Opptaket sendes bare til serveren i huset og lagres ikke. Uten motor på serveren brukes enheten.")
                .font(PF.ui(12)).foregroundStyle(p.mut).padding(.horizontal, 6).padding(.top, 4)
                .fixedSize(horizontal: false, vertical: true)
        }
        .task { await v.refresh(store) }
    }

    private var serverSub: String {
        guard let r = v.ready else { return "Sjekker serveren …" }
        if !r { return "Ingen motor klar på serveren nå · bruker enheten" }
        return v.engineName.isEmpty ? "Klar · norsk og engelsk" : "Klar · " + v.engineName
    }

    private func choice(_ t: String, _ sub: String, on: Bool, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(t).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                    Text(sub).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
                if on { Image(systemName: "checkmark").font(.system(size: 14, weight: .bold)).foregroundStyle(p.pos) }
            }
            .padding(.horizontal, 14).padding(.vertical, 11)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

/// Linjen under søkefeltet på Hjem: opptak/nedskriving med Avbryt, ellers den korte beskjeden etterpå.
struct Voice56SearchStatus: View {
    @Environment(\.paper) private var p
    @MainActor private var v: Voice56 { Voice56.shared }

    var body: some View {
        if v.active("search") {
            VStack(spacing: 0) {
                Rectangle().fill(p.line).frame(height: 1)
                Voice56Bar(ink: p.ink, mut: p.mut, font: { (s: CGFloat, w: Font.Weight) in PF.ui(s, w) })
                    .padding(.horizontal, 6)
            }
        } else if !v.note.isEmpty {
            VStack(spacing: 0) {
                Rectangle().fill(p.line).frame(height: 1)
                Text(v.note).font(PF.ui(12.5, .semibold)).foregroundStyle(p.mut).lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16).padding(.vertical, 8)
            }
            .accessibilityElement(children: .combine)
        }
    }
}
