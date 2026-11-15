import XCTest

/// shared/testvektorer/serveradresse.json mot ServerAddress (SharedNet), som Homelab-appen (API.normalize/isLocal) bruker.
final class ServerAddressTests: XCTestCase {
    func testVektorer() throws {
        let list: [[String: Any]] = try Repo.vectors("serveradresse")
        XCTAssertGreaterThan(list.count, 20)
        for v in list {
            let id: String = (v["id"] as? String) ?? "?"
            let input: String = (v["inn"] as? String) ?? ""
            let want: String? = v["normalisert"] as? String
            let got: String? = ServerAddress.normalize(input)
            XCTAssertEqual(got, want, id + ": normalisert for «" + input + "»")
            if let local = v["lokal"] as? Bool {
                let host: String = got.map { (s: String) -> String in ServerAddress.host(of: s) } ?? ""
                XCTAssertEqual(ServerAddress.isLocal(host), local, id + ": lokal for «" + input + "»")
            }
            if let allowed = v["tillatt"] as? Bool {
                XCTAssertEqual(ServerAddress.isAllowed(input), allowed, id + ": tillatt for «" + input + "»")
            }
            if let trusted = v["paaliteligEnhet"] as? Bool {
                let host: String = got.map { (s: String) -> String in ServerAddress.host(of: s) } ?? ""
                XCTAssertEqual(ServerAddress.isTrustedDeviceIP(host), trusted, id + ": pålitelig enhet for «" + input + "»")
            }
        }
    }
}

/// shared/testvektorer/idag.json mot OsloDate: «i dag» er Oslo-datoen også når maskinen har en annen tidssone (CI kjører i UTC).
final class TodayOsloTests: XCTestCase {
    func testVektorer() throws {
        let list: [[String: Any]] = try Repo.vectors("idag")
        XCTAssertGreaterThan(list.count, 5)
        for v in list {
            let id: String = (v["id"] as? String) ?? "?"
            guard let utc = v["utc"] as? String, let want = v["oslo"] as? String, let d = TestClock.date(utc) else {
                XCTFail(id + ": mangler utc/oslo")
                continue
            }
            XCTAssertEqual(OsloDate.key(d), want, id + ": " + utc)
        }
    }
}
