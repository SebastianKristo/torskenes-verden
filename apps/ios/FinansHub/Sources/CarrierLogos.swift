import SwiftUI
import UIKit
import os

/* ---------------- Prompt 42: transportørlogoer uten nettoppslag (PostNord-logoen vises ikke) ---------------- */
// claude-code-postnord-logo-fiks.md: fraktselskapet kommer inn som «POSTNORD», «PostNord AB», «PostNord Norge», «Postnord»
// eller «postnord_no». Navnet normaliseres til en carrier_id (postnord), og logoen hentes fra Asset Catalog (Carrier-<id>),
// pakket med appen. Reserven er en farget flis med 1–3 bokstaver («PN»), aldri hele navnet i liten tekst.
// Treffer ingen kjent logo, logges `logo_miss carrier=… normalized=…` (én gang per navn).

enum Carrier42 {
    /// Transportører med logo i appen (FinansHub/Resources/Assets.xcassets/Carrier-<id>).
    static let bundled: Set<String> = ["bring", "budbee", "dhl", "fedex", "gls", "helthjem", "instabox", "posten", "postnord", "schenker", "ups"]

    private static let aliases: [String: String] = [
        "db": "schenker", "dbschenker": "schenker", "schenkerab": "schenker",
        "postennorge": "posten", "postenbring": "bring", "bringexpress": "bring",
        "dhlexpress": "dhl", "dhlfreight": "dhl", "dhlparcel": "dhl", "dhlecommerce": "dhl",
        "upsexpress": "ups", "fedexexpress": "fedex", "glsnorge": "gls",
        "heltjem": "helthjem", "instaboxno": "instabox", "budbeeab": "budbee",
    ]

    private static let suffixes: [String] = [" ab", " as", " asa", " norge", " norway", " sverige", " sweden", " danmark", " denmark",
                                              " suomi", " finland", " no", " se", " dk", " fi", " group", " gmbh"]

    /// «PostNord AB» / «POSTNORD» / «postnord_no» → «postnord».
    static func id(_ raw: String) -> String {
        var s: String = raw.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        s = s.replacingOccurrences(of: "_", with: " ").replacingOccurrences(of: "-", with: " ").replacingOccurrences(of: ".", with: " ")
        var again: Bool = true
        while again {
            again = false
            for x in suffixes where s.hasSuffix(x) && s.count > x.count {
                s = String(s.dropLast(x.count)).trimmingCharacters(in: .whitespaces)
                again = true
            }
        }
        s = s.replacingOccurrences(of: " ", with: "")
        return aliases[s] ?? s
    }

    /// Logoen pakket med appen, eller nil.
    @MainActor static func image(_ raw: String) -> UIImage? {
        let i: String = id(raw)
        if i.isEmpty || i == "other" { return nil }
        if bundled.contains(i), let img = UIImage(named: "Carrier-" + i) { return img }
        miss(raw, i)
        return nil
    }

    /// 1–3 bokstaver til reserven: «PostNord» → «PN», «Fraktfirma X» → «FX», «bring» → «BR».
    static func initials(_ name: String) -> String {
        let words: [Substring] = name.split(whereSeparator: { $0 == " " || $0 == "_" || $0 == "-" })
        if words.count >= 2 { return String(words.prefix(3).compactMap { $0.first }).uppercased() }
        let caps: String = String(name.filter { $0.isUppercase })
        if caps.count >= 2 { return String(caps.prefix(3)) }
        return String(name.prefix(2)).uppercased()
    }

    @MainActor private static var logged: Set<String> = []
    private static let log: Logger = Logger(subsystem: "no.kristo.finanshub", category: "logo")

    @MainActor private static func miss(_ raw: String, _ norm: String) {
        if logged.contains(raw) { return }
        logged.insert(raw)
        log.notice("logo_miss carrier=\"\(raw, privacy: .public)\" normalized=\"\(norm, privacy: .public)\" source=app")
    }
}
