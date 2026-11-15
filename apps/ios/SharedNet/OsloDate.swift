import Foundation

/* ---------------- «I dag» er alltid Oslo-datoen (Q20) ---------------- */
// Fasit: shared/testvektorer/idag.json (F-logikk L3), kjørt av HomelabTests. For det som må virke uten nett (widgets, klokka,
// lokale varsler) og for å sende datoer til serveren. Ellers viser appen datoene serveren sender (`today`, `date` …).

enum OsloDate {
    static let timeZone: TimeZone = TimeZone(identifier: "Europe/Oslo") ?? TimeZone(secondsFromGMT: 3600) ?? TimeZone.current

    static let calendar: Calendar = {
        var c: Calendar = Calendar(identifier: .gregorian)
        c.timeZone = OsloDate.timeZone
        c.locale = Locale(identifier: "nb_NO")
        return c
    }()

    /// YYYY-MM-DD i Oslo for tidspunktet.
    static func key(_ date: Date) -> String {
        let c: DateComponents = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// I dag i Oslo.
    static func today() -> String { key(Date()) }
}
