import XCTest

/* ---------------- Prompt 47: «+» → Ny hendelse er synlig (claude-code-kalender-ny-hendelse-blank-2.md) ---------------- */
// Skjemaet var montert og hadde fokus, men var dekket av en ugjennomsiktig flate (tastaturvinduene fikk arkets bakgrunnsfarge).
// Testen trykker «+» to ganger (andre gang var den som feilet) og krever at «Ny hendelse» og «Tittel» er hit-testbare.
// Krever en innlogget Kalender på simulatoren; uten innlogging hoppes testen over.

final class KalNewUITests47: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    func testPlusShowsNewEventTwice() throws {
        let app: XCUIApplication = XCUIApplication()
        app.launch()
        let plus: XCUIElement = app.buttons["Ny hendelse"].firstMatch
        if !plus.waitForExistence(timeout: 8) {
            throw XCTSkip("Kalender er ikke logget inn på simulatoren")
        }
        for round in 1...2 {
            plus.tap()
            let heading: XCUIElement = app.staticTexts["kal.new.heading"]
            let title: XCUIElement = app.textFields["kal.new.title"]
            XCTAssertTrue(heading.waitForExistence(timeout: 3), "«Ny hendelse» finnes ikke (runde \(round))")
            XCTAssertTrue(title.waitForExistence(timeout: 3), "Tittel finnes ikke (runde \(round))")
            XCTAssertTrue(heading.isHittable, "«Ny hendelse» er ikke synlig (runde \(round))")
            XCTAssertTrue(title.isHittable, "Tittel er ikke synlig (runde \(round))")
            let cancel: XCUIElement = app.buttons["Avbryt"].firstMatch
            XCTAssertTrue(cancel.isHittable, "Avbryt er ikke synlig (runde \(round))")
            cancel.tap()
            XCTAssertTrue(plus.waitForExistence(timeout: 3))
        }
    }
}
