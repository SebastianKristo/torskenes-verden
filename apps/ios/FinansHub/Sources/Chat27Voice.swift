import SwiftUI
import UIKit
import AVFoundation
import Speech

/* ---------------- Prompt 27: Chat – tale inn (SFSpeechRecognizer nb-NO) og Les høyt (AVSpeechSynthesizer nb-NO) ---------------- */
// Mikrofonen viser «Lytter … snakk nå» med lydbølge; teksten havner i skrivefeltet mens du snakker.
// Lukkene som kalles fra lydtråden lages i nonisolated hjelpefunksjoner, så de ikke arver @MainActor.

@MainActor
@Observable
final class ChatVoice27 {
    static let shared = ChatVoice27()

    var recording: Bool = false
    /// Sju søyler (0–1) til lydbølgen.
    var levels: [CGFloat] = Array(repeating: 0.25, count: 7)
    /// Meldingen som leses høyt nå.
    var speaking: String? = nil

    @ObservationIgnored private let engine: AVAudioEngine = AVAudioEngine()
    @ObservationIgnored private var request: SFSpeechAudioBufferRecognitionRequest? = nil
    @ObservationIgnored private var task: SFSpeechRecognitionTask? = nil
    @ObservationIgnored private let synth: AVSpeechSynthesizer = AVSpeechSynthesizer()
    @ObservationIgnored private let ttsDelegate: ChatTTSDelegate27 = ChatTTSDelegate27()

    init() {
        synth.delegate = ttsDelegate
    }

    /* ---------- Tale inn ---------- */

    func toggle(onText: @escaping (String) -> Void, onError: @escaping (String) -> Void) {
        if recording { stop(); return }
        Task { await self.start(onText: onText, onError: onError) }
    }

    private func start(onText: @escaping (String) -> Void, onError: @escaping (String) -> Void) async {
        let auth: SFSpeechRecognizerAuthorizationStatus = await ChatVoice27.speechAuth()
        guard auth == .authorized else { onError("Gi FinansHub tilgang til talegjenkjenning i Innstillinger"); return }
        let mic: Bool = await AVAudioApplication.requestRecordPermission()
        guard mic else { onError("Gi FinansHub tilgang til mikrofonen i Innstillinger"); return }
        guard let rec = SFSpeechRecognizer(locale: Locale(identifier: "nb-NO")), rec.isAvailable else {
            onError("Talegjenkjenning på norsk er ikke tilgjengelig nå")
            return
        }
        stopSpeaking()
        do {
            let session: AVAudioSession = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .measurement, options: [.duckOthers, .defaultToSpeaker])
            try session.setActive(true, options: .notifyOthersOnDeactivation)
            let req = SFSpeechAudioBufferRecognitionRequest()
            req.shouldReportPartialResults = true
            request = req
            let input: AVAudioInputNode = engine.inputNode
            let fmt: AVAudioFormat = input.outputFormat(forBus: 0)
            input.removeTap(onBus: 0)
            input.installTap(onBus: 0, bufferSize: 1024, format: fmt, block: ChatVoice27.tapBlock(req) { [weak self] lvl in
                Task { @MainActor in self?.push(lvl) }
            })
            engine.prepare()
            try engine.start()
            recording = true
            Haptics.shared.tap()
            task = rec.recognitionTask(with: req, resultHandler: ChatVoice27.resultHandler(
                text: { t in Task { @MainActor in onText(t) } },
                end: { [weak self] in Task { @MainActor in self?.stop() } }))
        } catch {
            stop()
            onError("Fikk ikke startet mikrofonen")
        }
    }

    func stop() {
        if engine.isRunning { engine.stop() }
        engine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        task?.finish()
        request = nil
        task = nil
        if recording { Haptics.shared.tap() }
        recording = false
        levels = Array(repeating: 0.25, count: 7)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func push(_ lvl: Float) {
        var l: [CGFloat] = levels
        l.removeFirst()
        l.append(CGFloat(Swift.max(0.15, Swift.min(1, lvl))))
        levels = l
    }

    nonisolated private static func speechAuth() async -> SFSpeechRecognizerAuthorizationStatus {
        await withCheckedContinuation { (c: CheckedContinuation<SFSpeechRecognizerAuthorizationStatus, Never>) in
            SFSpeechRecognizer.requestAuthorization { s in c.resume(returning: s) }
        }
    }

    /// Lydbufferen går til gjenkjenningen, og nivået (RMS) til lydbølgen.
    nonisolated private static func tapBlock(_ req: SFSpeechAudioBufferRecognitionRequest, level: @escaping @Sendable (Float) -> Void) -> AVAudioNodeTapBlock {
        return { (buf: AVAudioPCMBuffer, _: AVAudioTime) in
            req.append(buf)
            guard let ch = buf.floatChannelData?[0] else { return }
            let n: Int = Int(buf.frameLength)
            if n == 0 { return }
            var sum: Float = 0
            var i: Int = 0
            while i < n {
                let v: Float = ch[i]
                sum += v * v
                i += 8
            }
            let rms: Float = (sum / Float(Swift.max(1, n / 8))).squareRoot()
            level(Swift.min(1, rms * 12))
        }
    }

    nonisolated private static func resultHandler(text: @escaping @Sendable (String) -> Void, end: @escaping @Sendable () -> Void) -> (SFSpeechRecognitionResult?, Error?) -> Void {
        return { (result: SFSpeechRecognitionResult?, error: Error?) in
            if let r = result { text(r.bestTranscription.formattedString) }
            if error != nil || (result?.isFinal ?? false) { end() }
        }
    }

    /* ---------- Les høyt ---------- */

    func speak(_ key: String, _ text: String) {
        if speaking == key { stopSpeaking(); return }
        stopSpeaking()
        if recording { stop() }
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
        let clean: String = text.replacingOccurrences(of: "**", with: "").replacingOccurrences(of: "`", with: "")
        let u = AVSpeechUtterance(string: clean)
        u.voice = AVSpeechSynthesisVoice(language: "nb-NO") ?? AVSpeechSynthesisVoice(language: "no-NO")
        u.rate = AVSpeechUtteranceDefaultSpeechRate
        speaking = key
        synth.speak(u)
    }

    /// Fra delegaten: ferdig eller avbrutt (en ny opplesing kan allerede ha startet).
    func ended() {
        if !synth.isSpeaking { speaking = nil }
    }

    func stopSpeaking() {
        if synth.isSpeaking { synth.stopSpeaking(at: .immediate) }
        speaking = nil
    }
}

/// Ferdig eller avbrutt: «Les høyt» blir vanlig igjen.
final class ChatTTSDelegate27: NSObject, AVSpeechSynthesizerDelegate {
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in ChatVoice27.shared.ended() }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        Task { @MainActor in ChatVoice27.shared.ended() }
    }
}

/// Lydbølgen mens mikrofonen er på.
struct ChatWave27: View {
    @MainActor private var v: ChatVoice27 { ChatVoice27.shared }
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
