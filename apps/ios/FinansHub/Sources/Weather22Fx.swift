import SwiftUI

/* ---------------- Prompt 22: valg av væranimasjon (Vaer.dc.html → fxK) ---------------- */

/// Hvilken animasjon værkoden gir: sun | part | stars | partn | clouds | rain | snow | fog.
func wxFxKind22(_ code: Int, night: Bool) -> String {
    if (code >= 71 && code <= 77) || code == 85 || code == 86 { return "snow" }
    if (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95 { return "rain" }
    if code == 45 || code == 48 { return "fog" }
    if code == 3 { return "clouds" }
    if night { return code == 2 ? "partn" : "stars" }
    return code == 2 ? "part" : "sun"
}

// Prompt 28: WxSky22, WxFx22 og WxFxPainter22 er erstattet av WxSky28/WxFx28 (Weather28Fx.swift, Weather28Sim.swift).
