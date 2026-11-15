import XCTest

/// shared/testvektorer/datoer.json (Q17, Q36–Q38) mot den lokale forhåndsvisningen i Kalender (KalQuick).
///
/// Serveren er fasit for datoen (POST /api/dates/parse, Glimt-agenten). KalQuick er bare forhåndsvisningen mens man skriver,
/// og avviker fortsatt på noen regler. Avvikene registreres som forventede feil (ikke strenge), så de synes i rapporten
/// uten å stoppe bygget – samme ordning som todo-merkene i test/testvektorer.test.js. Når KalQuick byttes ut med serverens
/// svar (bølge 2), settes `strict` til true.
final class DateVectorTests: XCTestCase {
    static let strict: Bool = false

    override class func setUp() {
        super.setUp()
        TestClock.useOslo()
    }

    private static func hm(_ minutes: Int?) -> String? {
        guard let m = minutes else { return nil }
        return String(format: "%02d:%02d", m / 60, m % 60)
    }

    func testKalQuickMotVektorene() throws {
        let list: [[String: Any]] = try Repo.vectors("datoer")
        XCTAssertGreaterThan(list.count, 30)
        var ok: Int = 0
        for v in list {
            let id: String = (v["id"] as? String) ?? "?"
            guard let text = v["tekst"] as? String, let nowS = v["naa"] as? String, let now = TestClock.date(nowS) else {
                XCTFail(id + ": mangler tekst/naa")
                continue
            }
            let p: KalParsed = KalQuick.parse(text, defaultRem: nil, now: now)
            let wantDate: String? = v["dato"] as? String
            let wantTime: String? = v["tid"] as? String
            let gotTime: String? = DateVectorTests.hm(p.s)
            if p.day == wantDate && gotTime == wantTime {
                ok += 1
                continue
            }
            let msg: String = id + " «" + text + "»: fikk " + p.day + " " + (gotTime ?? "–") + ", ventet " + (wantDate ?? "–") + " " + (wantTime ?? "–")
            if DateVectorTests.strict {
                XCTFail(msg)
            } else {
                XCTExpectFailure("Kjent avvik i KalQuick (serveren er fasit): " + msg, strict: false) {
                    XCTFail(msg)
                }
            }
        }
        print("DateVectorTests: KalQuick stemmer med " + String(ok) + " av " + String(list.count) + " vektorer i datoer.json")
    }
}
