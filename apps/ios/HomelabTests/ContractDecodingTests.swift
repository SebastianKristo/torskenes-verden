import XCTest

/// Eksemplene i shared/schemas/eksempler (ekte svar fra serveren med eksempeldata, scripts/kontrakt-eksempler.mjs) dekodes med
/// DTO-ene i SharedNet/APIModels.swift. test/kontrakt-eksempler.test.js sjekker at de samme eksemplene følger skjemaene.
final class ContractDecodingTests: XCTestCase {
    private func decode<T: Decodable>(_ type: T.Type, _ file: String, line: UInt = #line) throws -> T {
        let d: Data = try Repo.data("shared/schemas/eksempler/" + file)
        do {
            return try JSONDecoder().decode(type, from: d)
        } catch {
            XCTFail(file + ": " + String(describing: error), line: line)
            throw error
        }
    }

    func testVersion() throws {
        let v: VersionDTO = try decode(VersionDTO.self, "version.json")
        XCTAssertFalse(v.minClient.isEmpty)
        XCTAssertGreaterThanOrEqual(v.contract, APIClient.contractVersion)
        // Appen og serveren i samme release skal passe sammen (Q19).
        XCTAssertEqual(APIClient.compatibility(v, appVersion: "4.0"), ServerCompat.ok)
    }

    func testMeOgInnlogging() throws {
        let me: MeDTO = try decode(MeDTO.self, "me.json")
        XCTAssertFalse(me.username.isEmpty)
        let t: AuthTokenDTO = try decode(AuthTokenDTO.self, "auth-token.json")
        XCTAssertTrue(t.token.hasPrefix("fh_"))
        let tokens: [TokenDTO] = try decode([TokenDTO].self, "tokens.json")
        XCTAssertFalse(tokens.isEmpty)
    }

    func testForsideOgBrief() throws {
        let h: MobileHomeDTO = try decode(MobileHomeDTO.self, "mobile-home.json")
        XCTAssertFalse(h.greeting.isEmpty)
        _ = try decode(BriefDTO.self, "brief.json")
        _ = try decode(BriefWidgetDTO.self, "brief-widget.json")
    }

    func testKalenderOgDatoer() throws {
        let k: KalenderDTO = try decode(KalenderDTO.self, "kalender.json")
        XCTAssertFalse(k.today.isEmpty)
        _ = try decode(WidgetsCalendarDTO.self, "widgets-calendar.json")
        let h: DatesHolidaysDTO = try decode(DatesHolidaysDTO.self, "dates-holidays.json")
        XCTAssertFalse(h.items.isEmpty)
        let p: DatesParseDTO = try decode(DatesParseDTO.self, "dates-parse.json")
        XCTAssertEqual(p.date, "2026-11-20")
        XCTAssertEqual(p.time, "14:30")
    }

    func testOkonomi() throws {
        let s: FinansSummaryDTO = try decode(FinansSummaryDTO.self, "finans-summary.json")
        XCTAssertFalse(s.month.isEmpty)
        _ = try decode(FinansTransactionsDTO.self, "finans-transactions.json")
        let subs: FinansSubscriptionsDTO = try decode(FinansSubscriptionsDTO.self, "finans-subscriptions.json")
        // Serveren eier neste trekk og omregningen per måned (F-logikk L2).
        for item in subs.items where item.active {
            XCTAssertNotNil(item.perLabel, item.name)
        }
        // Fase 6 (Q4): Faste betalinger med filtrene og serverens label, nextDate, daysLeft og monthly.
        let fb: FasteBetalingerDTO = try decode(FasteBetalingerDTO.self, "finans-faste-betalinger.json")
        XCTAssertEqual(fb.filters.map { (f: FasteBetalingerDTO.Filter) -> String in f.id }, ["abonnementer", "faste", "planlagte"])
        for b in fb.items { XCTAssertFalse(b.label.isEmpty, b.name) }
    }

    func testOppgaverMediaOgLive() throws {
        _ = try decode(TasksDTO.self, "tasks.json")
        _ = try decode(MediaStatusDTO.self, "media-status.json")
        _ = try decode(LiveAktiviteterDTO.self, "live-aktiviteter.json")
    }

    func testFeilformen() throws {
        let e: APIErrorDTO = try decode(APIErrorDTO.self, "error.json")
        XCTAssertEqual(e.code, "HOMELAB_AUTH")
        let d: Data = try Repo.data("shared/schemas/eksempler/error.json")
        let err: HomelabError = HomelabError.server(status: 401, data: d)
        XCTAssertTrue(err.isUnauthorized)
        XCTAssertFalse(err.isTokenExpired)
        XCTAssertEqual(err.reason, "invalid")
    }
}

/// Regler i APIClient og HomelabError uten nett.
final class APIClientRuleTests: XCTestCase {
    func testTokenExpired() {
        let body: Data = Data(#"{"error":"Innloggingen er utløpt. Logg inn på nytt.","code":"TOKEN_EXPIRED","reason":"expired"}"#.utf8)
        let e: HomelabError = HomelabError.server(status: 401, data: body)
        XCTAssertTrue(e.isTokenExpired)
        XCTAssertEqual(e.message, "Innloggingen er utløpt. Logg inn på nytt.")
    }

    func testEldreKodeOgTomKropp() {
        let e: HomelabError = HomelabError.server(status: 400, data: Data(#"{"error":"Feil","kode":"bilde_mangler"}"#.utf8))
        XCTAssertEqual(e.code, "bilde_mangler")
        let empty: HomelabError = HomelabError.server(status: 502, data: Data())
        XCTAssertEqual(empty.message, "Feil 502")
    }

    func testVersjonsregel() {
        XCTAssertEqual(APIClient.compatibility(nil, appVersion: "4.0"), .updateServer("Serveren er for gammel for denne appen. Oppdater serveren."))
        XCTAssertTrue(AppVersion("4.0") == AppVersion("4.0.0"))
        XCTAssertTrue(AppVersion("4.9.9") < AppVersion("4.10.0"))
        XCTAssertFalse(AppVersion("5.0") < AppVersion("4.73.1"))
    }

    func testTransportfeilKanLeggesIKo() {
        let off: HomelabError = HomelabError.transport(URLError(.notConnectedToInternet), host: "nas.local")
        XCTAssertTrue(off.neverSent)
        let slow: HomelabError = HomelabError.transport(URLError(.timedOut), host: "nas.local")
        XCTAssertFalse(slow.neverSent)
        XCTAssertEqual(slow.code, "timeout")
    }
}
