// swift-tools-version:5.9
// vision-ocr – Apple Vision OCR-tjeneste for Mac mini-en (prompt 48, Del 3).
// Ingen eksterne pakker. Rene funksjoner ligger i VisionOCRCore (testes med `swift test`),
// alt som bruker Vision/ImageIO/CoreImage/sokler ligger i den kjørbare målgruppen.
import PackageDescription

let package = Package(
    name: "vision-ocr",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "vision-ocr", targets: ["vision-ocr"]),
    ],
    targets: [
        .target(
            name: "VisionOCRCore",
            path: "Sources/VisionOCRCore"
        ),
        .executableTarget(
            name: "vision-ocr",
            dependencies: ["VisionOCRCore"],
            path: "Sources/vision-ocr"
        ),
        .testTarget(
            name: "VisionOCRCoreTests",
            dependencies: ["VisionOCRCore"],
            path: "Tests/VisionOCRCoreTests"
        ),
    ]
)
