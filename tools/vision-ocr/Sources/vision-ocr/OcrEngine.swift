// Bilde → felles OCR-format med Apple Vision.
// Forbehandling: ImageIO (HEIC/JPEG/PNG …) med EXIF-orientering, dokumentsegmentering
// (VNDetectDocumentSegmentationRequest) + CIPerspectiveCorrection (beskjæring), deretter
// overlappende bånd for lange kvitteringer og VNRecognizeTextRequest (.accurate).
import CoreGraphics
import CoreImage
import Foundation
import ImageIO
import Vision
import VisionOCRCore

enum OcrError: Error {
    case unreadableImage
    case tooManyPixels
    case timeout
    case vision(String)

    var status: Int {
        switch self {
        case .unreadableImage: return 422
        case .tooManyPixels: return 413
        case .timeout: return 504
        case .vision: return 500
        }
    }

    var message: String {
        switch self {
        case .unreadableImage: return "Kunne ikke lese bildet (støttet: HEIC, JPEG, PNG, TIFF m.fl.)."
        case .tooManyPixels: return "Bildet har for mange piksler."
        case .timeout: return "OCR tok for lang tid."
        case .vision(let m): return "Vision feilet: \(m)"
        }
    }
}

struct EngineOutput {
    let result: OcrResult
    let cropped: Bool
    let bands: Int
}

/// Alle Vision-/CoreImage-objekter lages og brukes inne i ett kall, og serveren kjører bare
/// én jobb om gangen. Klassen har bare uforanderlige felt; CIContext er trådsikker.
final class OcrEngine: @unchecked Sendable {
    let supported: [String]
    let choice: LanguageChoice
    let languageCorrection: Bool
    let maxPixels = 120_000_000
    let maxSide = 8192
    private let ciContext: CIContext

    init(overrideLanguages: [String]?, languageCorrection: Bool) {
        let probe = VNRecognizeTextRequest()
        probe.recognitionLevel = .accurate
        let sup = (try? probe.supportedRecognitionLanguages()) ?? []
        supported = sup
        choice = chooseLanguages(supported: sup, override: overrideLanguages)
        self.languageCorrection = languageCorrection
        ciContext = CIContext(options: nil)
    }

    /// Hele løpet for ett bilde. Kaster `OcrError`.
    func run(data: Data, crop: Bool, deadline: Date) throws -> EngineOutput {
        let started = DispatchTime.now().uptimeNanoseconds
        return try autoreleasepool { () throws -> EngineOutput in
            let decoded = try decode(data)
            if Date() > deadline { throw OcrError.timeout }
            var image = decoded
            var cropped = false
            if crop, let rect = rectify(decoded) {
                image = rect
                cropped = true
            }
            let width = image.width
            let height = image.height
            let bands = bandRanges(width: width, height: height)
            var perBand: [[OcrLine]] = []
            for band in bands {
                if Date() > deadline { throw OcrError.timeout }
                let part: CGImage
                if bands.count == 1 {
                    part = image
                } else {
                    guard let c = image.cropping(to: CGRect(x: 0, y: band.top, width: width, height: band.height)) else {
                        throw OcrError.vision("kunne ikke dele bildet i bånd")
                    }
                    part = c
                }
                let local = try recognize(part)
                perBand.append(local.map {
                    OcrLine(text: $0.text, confidence: $0.confidence,
                            bbox: bandToGlobal($0.bbox, band: band, imageHeight: height))
                })
            }
            let merged = mergeBands(perBand, bands: bands, imageHeight: height)
            let ms = Int((DispatchTime.now().uptimeNanoseconds - started) / 1_000_000)
            return EngineOutput(result: buildResult(lines: merged, width: width, height: height, ms: ms),
                                cropped: cropped, bands: bands.count)
        }
    }

    /// ImageIO: dekoder og roterer etter EXIF-orientering (oppreist bilde ut).
    func decode(_ data: Data) throws -> CGImage {
        let srcOpts: [CFString: Any] = [kCGImageSourceShouldCache: false]
        guard let src = CGImageSourceCreateWithData(data as CFData, srcOpts as CFDictionary),
              CGImageSourceGetCount(src) > 0 else {
            throw OcrError.unreadableImage
        }
        let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [String: Any] ?? [:]
        let w = (props[kCGImagePropertyPixelWidth as String] as? NSNumber)?.intValue ?? 0
        let h = (props[kCGImagePropertyPixelHeight as String] as? NSNumber)?.intValue ?? 0
        guard w > 0, h > 0 else { throw OcrError.unreadableImage }
        guard w * h <= maxPixels else { throw OcrError.tooManyPixels }
        let side = min(max(w, h), maxSide)
        let opts: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: side,
        ]
        guard let img = CGImageSourceCreateThumbnailAtIndex(src, 0, opts as CFDictionary) else {
            throw OcrError.unreadableImage
        }
        return img
    }

    /// Finner kvitteringen i bildet og retter opp perspektivet. Nil = bruk bildet som det er.
    func rectify(_ img: CGImage) -> CGImage? {
        let req = VNDetectDocumentSegmentationRequest()
        let handler = VNImageRequestHandler(cgImage: img, orientation: .up, options: [:])
        do { try handler.perform([req]) } catch { return nil }
        guard let obs = req.results?.first else { return nil }
        let corners = [obs.topLeft, obs.topRight, obs.bottomRight, obs.bottomLeft].map {
            NPoint(x: Double($0.x), y: Double($0.y))
        }
        guard shouldRectify(confidence: Double(obs.confidence), corners: corners) else { return nil }
        // Vision og CoreImage har begge origo nede til venstre.
        let W = CGFloat(img.width)
        let H = CGFloat(img.height)
        func vec(_ p: CGPoint) -> CIVector { CIVector(x: p.x * W, y: p.y * H) }
        guard let filter = CIFilter(name: "CIPerspectiveCorrection") else { return nil }
        filter.setValue(CIImage(cgImage: img), forKey: kCIInputImageKey)
        filter.setValue(vec(obs.topLeft), forKey: "inputTopLeft")
        filter.setValue(vec(obs.topRight), forKey: "inputTopRight")
        filter.setValue(vec(obs.bottomLeft), forKey: "inputBottomLeft")
        filter.setValue(vec(obs.bottomRight), forKey: "inputBottomRight")
        guard let out = filter.outputImage else { return nil }
        let extent = out.extent.integral
        guard extent.width >= 64, extent.height >= 64, extent.width.isFinite, extent.height.isFinite,
              let cg = ciContext.createCGImage(out, from: extent) else { return nil }
        return cg
    }

    /// OCR på ett (oppreist) bilde. bbox normalisert mot dette bildet, origo øverst til venstre.
    func recognize(_ img: CGImage) throws -> [OcrLine] {
        let req = VNRecognizeTextRequest()
        req.recognitionLevel = .accurate
        req.usesLanguageCorrection = languageCorrection
        req.recognitionLanguages = choice.languages
        req.automaticallyDetectsLanguage = false
        if languageCorrection { req.customWords = receiptCustomWords }
        let handler = VNImageRequestHandler(cgImage: img, orientation: .up, options: [:])
        do {
            try handler.perform([req])
        } catch {
            throw OcrError.vision(error.localizedDescription)
        }
        var out: [OcrLine] = []
        for o in req.results ?? [] {
            guard let cand = o.topCandidates(1).first else { continue }
            let text = cand.string.trimmingCharacters(in: .whitespacesAndNewlines)
            if text.isEmpty { continue }
            let bb = o.boundingBox
            out.append(OcrLine(
                text: text,
                confidence: Double(cand.confidence),
                bbox: visionToTopLeft(x: Double(bb.origin.x), y: Double(bb.origin.y),
                                      width: Double(bb.size.width), height: Double(bb.size.height))
            ))
        }
        return out
    }
}
