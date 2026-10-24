// vision-ocr – Apple Vision OCR-tjeneste for Glimt/FinansHub (kvitteringer, vitnemål, fakturaer).
//
//   vision-ocr [--config FIL]               start tjenesten (standard, brukes av LaunchAgent)
//   vision-ocr --check-config [--config FIL] sjekk config.json og avslutt
//   vision-ocr --print-languages            vis språkene Vision støtter og valget
//   vision-ocr --ocr-file BILDE [--no-crop] kjør OCR på en fil og skriv felles OCR-format (JSON)
//   vision-ocr --version
import Darwin
import Foundation
import VisionOCRCore

let appVersion = "1.0.0"

setvbuf(stdout, nil, _IOLBF, 0)
signal(SIGPIPE, SIG_IGN)

func defaultConfigPath() -> String {
    NSHomeDirectory() + "/Library/Application Support/vision-ocr/config.json"
}

func usage(_ code: Int32) -> Never {
    let text = """
    Bruk:
      vision-ocr [--config FIL]                 start tjenesten
      vision-ocr --check-config [--config FIL]  sjekk config.json
      vision-ocr --print-languages [--config FIL]
      vision-ocr --ocr-file BILDE [--no-crop]   OCR på en lokal fil (JSON til stdout)
      vision-ocr --version

    Standard config: \(defaultConfigPath())

    """
    FileHandle.standardError.write(Data(text.utf8))
    exit(code)
}

var configPath = defaultConfigPath()
var mode = "serve"
var ocrFile = ""
var crop = true
var argIndex = 1
let argv = CommandLine.arguments
while argIndex < argv.count {
    let a = argv[argIndex]
    switch a {
    case "--config":
        argIndex += 1
        if argIndex >= argv.count { usage(64) }
        configPath = argv[argIndex]
    case "--check-config":
        mode = "check"
    case "--print-languages":
        mode = "languages"
    case "--ocr-file":
        argIndex += 1
        if argIndex >= argv.count { usage(64) }
        ocrFile = argv[argIndex]
        mode = "ocr-file"
    case "--no-crop":
        crop = false
    case "--version":
        print("vision-ocr \(appVersion)")
        exit(0)
    case "-h", "--help":
        usage(0)
    default:
        FileHandle.standardError.write(Data("Ukjent argument: \(a)\n".utf8))
        usage(64)
    }
    argIndex += 1
}

/// Leser config.json. Ved feil: nil (og loggfører hvorfor når `required`).
func readConfig(_ path: String, required: Bool) -> ServiceConfig? {
    do {
        return try loadConfig(path: path)
    } catch {
        if required { logLine("Kan ikke lese \(path): \(error.localizedDescription). Kjør install.sh på nytt.") }
        return nil
    }
}

switch mode {
case "languages":
    let cfg = readConfig(configPath, required: false)
    let engine = OcrEngine(overrideLanguages: cfg?.languages, languageCorrection: cfg?.effectiveLanguageCorrection ?? true)
    print("Støttet av Vision (.accurate): \(engine.supported.joined(separator: ", "))")
    print("Valgt: \(engine.choice.languages.joined(separator: ", "))")
    print(engine.choice.note)
    exit(0)

case "ocr-file":
    let cfg = readConfig(configPath, required: false)
    guard let data = FileManager.default.contents(atPath: ocrFile) else {
        FileHandle.standardError.write(Data("Fant ikke filen \(ocrFile)\n".utf8))
        exit(66)
    }
    let engine = OcrEngine(overrideLanguages: cfg?.languages, languageCorrection: cfg?.effectiveLanguageCorrection ?? true)
    do {
        let out = try engine.run(data: data, crop: crop, deadline: Date().addingTimeInterval(300))
        FileHandle.standardOutput.write(Data(encodeResult(out.result, pretty: true)))
        print("")
        FileHandle.standardError.write(Data("språk: \(engine.choice.languages.joined(separator: ",")), bånd: \(out.bands), beskåret: \(out.cropped ? "ja" : "nei")\n".utf8))
        exit(0)
    } catch let e as OcrError {
        FileHandle.standardError.write(Data("\(e.message)\n".utf8))
        exit(1)
    } catch {
        FileHandle.standardError.write(Data("\(error)\n".utf8))
        exit(1)
    }

default:
    guard let cfg = readConfig(configPath, required: true) else { exit(78) }
    let errors = validateConfig(cfg)
    if !errors.isEmpty {
        for e in errors { logLine("Feil i \(configPath): \(e)") }
        exit(78)
    }
    guard let allow = IPAllowList(cfg.allow) else { exit(78) }
    if let attrs = try? FileManager.default.attributesOfItem(atPath: configPath),
       let perm = attrs[.posixPermissions] as? NSNumber, perm.intValue & 0o077 != 0 {
        logLine("Advarsel: \(configPath) kan leses av andre (inneholder nøkkelen). Kjør: chmod 600 \"\(configPath)\"")
    }
    if mode == "check" {
        print("config.json er gyldig: \(cfg.bindIP):\(cfg.port), tillatt: \(cfg.allow.joined(separator: ", "))")
        exit(0)
    }
    let engine = OcrEngine(overrideLanguages: cfg.languages, languageCorrection: cfg.effectiveLanguageCorrection)
    logLine("vision-ocr \(appVersion) starter (macOS \(ProcessInfo.processInfo.operatingSystemVersionString))")
    logLine("Vision støtter: \(engine.supported.joined(separator: ", "))")
    logLine("Språk valgt: \(engine.choice.languages.joined(separator: ", ")) – \(engine.choice.note); språkkorrigering: \(engine.languageCorrection ? "på" : "av")")
    logLine("Maks bilde \(cfg.effectiveMaxBytes / (1024 * 1024)) MB, tidsavbrudd \(cfg.effectiveTimeout) s, én OCR-jobb om gangen")
    let server = OCRServer(config: cfg, allow: allow, engine: engine, version: appVersion)
    server.run()
}
