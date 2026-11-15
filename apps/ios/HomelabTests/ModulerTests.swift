import XCTest

/// Fase 6: modullisten. Appen bruker shared/schemas/moduler.json som innebygd reserve (project.yml) og svaret fra GET /api/moduler.
/// Testene leser de samme filene fra repoet og sjekker at DTO-ene dekoder dem, at filtreringen er som på serveren, at gamle ruter
/// går til riktig sted, og at hver iOS-modul har en side i appen (ModulSider.swift).
final class ModulerTests: XCTestCase {
    private func kilde() throws -> ModulListeDTO {
        let d: Data = try Repo.data("shared/schemas/moduler.json")
        guard let l = ModulListeDTO.decode(d) else {
            XCTFail("shared/schemas/moduler.json kan ikke dekodes")
            throw NSError(domain: "ModulerTests", code: 1)
        }
        return l
    }

    func testKildenOgEksempletDekodes() throws {
        let l: ModulListeDTO = try kilde()
        XCTAssertGreaterThanOrEqual(l.versjon, 1)
        XCTAssertFalse(l.moduler.isEmpty)
        let e: Data = try Repo.data("shared/schemas/eksempler/moduler.json")
        XCTAssertNotNil(ModulListeDTO.decode(e), "eksempler/moduler.json")
    }

    func testHverIosModulHarEnSide() throws {
        let l: ModulListeDTO = try kilde()
        for m in l.moduler where m.plattformer.contains("ios") {
            XCTAssertNotNil(ModulSider.side[m.id], "Modulen \(m.id) mangler side i ModulSider.swift")
        }
        // Og ingen side for en modul som ikke finnes.
        for id in ModulSider.side.keys {
            XCTAssertNotNil(l.modul(id), "ModulSider har \(id), som ikke står i modullisten")
        }
    }

    func testEldreNokler() {
        XCTAssertEqual(ModulSider.modulId("huske"), "gjoremal")
        XCTAssertEqual(ModulSider.modulId("avg"), "reise")
        XCTAssertEqual(ModulSider.modulId("rss"), "nyheter")
        XCTAssertEqual(ModulSider.modulId("hjem"), "oversikt")
        XCTAssertEqual(ModulSider.appSide("avganger"), "avg")
        XCTAssertNil(ModulSider.modulId("innst"))
    }

    func testFiltreringSomPaServeren() throws {
        let l: ModulListeDTO = try kilde()
        let bruker: ModulListeDTO = l.filtrert(plattform: "ios", admin: false, tilganger: [])
        XCTAssertNil(bruker.modul("domener"), "admin-modul")
        XCTAssertNil(bruker.modul("media"), "krever tilgang")
        XCTAssertNil(bruker.modul("smarthjem"), "bare web")
        XCTAssertFalse(bruker.innstillinger.contains { (s: InnstillingDTO) -> Bool in s.id == "server" })
        let admin: ModulListeDTO = l.filtrert(plattform: "ios", admin: true, tilganger: [])
        XCTAssertNotNil(admin.modul("domener"))
        XCTAssertNotNil(admin.modul("media"))
        XCTAssertEqual(admin.innstillinger.last?.id, "server")
        for id in bruker.toppmeny { XCTAssertNotNil(bruker.modul(id), id) }
    }

    func testGamleRuter() throws {
        let l: ModulListeDTO = try kilde()
        XCTAssertEqual(l.treff(rute: "#/huskeliste")?.modul.id, "gjoremal")
        XCTAssertEqual(l.treff(rute: "#/dash")?.modul.id, "oversikt")
        XCTAssertEqual(l.treff(rute: "#/nyhetsleser")?.modul.id, "nyheter")
        XCTAssertEqual(l.treff(rute: "#/avganger")?.modul.id, "reise")
        let kart: ModulTreff? = l.treff(rute: "#/kart")
        XCTAssertEqual(kart?.modul.id, "reise")
        XCTAssertEqual(kart?.underside?.id, "kart")
        let bursdag: ModulTreff? = l.treff(rute: "#/bursdager")
        XCTAssertEqual(bursdag?.modul.id, "kalender")
        XCTAssertEqual(bursdag?.underside?.id, "bursdager")
        XCTAssertEqual(l.treff(rute: "#/familiekalender")?.underside?.id, "familie")
        XCTAssertEqual(l.treff(rute: "/finans")?.modul.id, "finans")
        XCTAssertEqual(l.treff(rute: "kalender")?.modul.id, "kalender")
        XCTAssertNil(l.treff(rute: "kalender")?.underside, "selve kalenderen, ikke en visning")
        XCTAssertNil(l.treff(rute: "#/finnes-ikke"))
    }

    func testKalendervisningeneIListensRekkefolge() throws {
        let l: ModulListeDTO = try kilde()
        let v: [String] = l.modul("kalender")?.undersider(type: "visning").map { (u: ModulUndersideDTO) -> String in u.id } ?? []
        XCTAssertEqual(Array(v.prefix(6)), ["ar", "mnd", "uke", "3d", "dag", "liste"])
    }
}
