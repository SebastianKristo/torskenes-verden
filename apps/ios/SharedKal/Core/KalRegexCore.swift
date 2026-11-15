import Foundation

/* ---------------- Prompt 45: regulære uttrykk kompileres én gang ---------------- */
// Fagfarge (KalFag37), «prøveperiode» (KalSchool37), Media (KalRx44) og dag-tolkingen (KalDay35) laget et nytt
// NSRegularExpression for hver hendelse og hver tegning. På Mac tegnes vinduet 6–8 ganger under en synk (også når man
// trykker på widgeten), og det ga tusenvis av kompileringer på hovedtråden. NSRegularExpression er trådsikker når den er
// laget, så bufferen deles av app, widgets og bakgrunnstråder (lås rundt oppslaget). Felles for Kalender, widgetene og Mac.

enum KalRx45 {
    private static let lock: NSLock = NSLock()
    nonisolated(unsafe) private static var cache: [String: NSRegularExpression] = [:]

    static func re(_ pattern: String, caseInsensitive: Bool = true) -> NSRegularExpression? {
        let key: String = (caseInsensitive ? "i|" : "s|") + pattern
        lock.lock()
        if let r = cache[key] {
            lock.unlock()
            return r
        }
        lock.unlock()
        guard let r = try? NSRegularExpression(pattern: pattern, options: caseInsensitive ? [.caseInsensitive] : []) else { return nil }
        lock.lock()
        // Mønstrene er faste i koden; grensen er bare et vern mot mønstre bygd fra tekst.
        if cache.count > 400 { cache.removeAll() }
        cache[key] = r
        lock.unlock()
        return r
    }
}
