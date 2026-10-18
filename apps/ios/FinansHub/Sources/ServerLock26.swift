import Foundation

/* ---------------- Brukerskille runde 2: serveroppsett i FinansHub ----------------
   Alle roller får full FinansHub med eget regnskap. Bare serveroppsettet (AI-motorer, modeller, OCR, tidsgrenser,
   Roboflow og SMB-backup) er felles og kan bare endres av admin. Bootstrap og GET /settings sier det med canEditServer. */

enum ServerLock26 {
    /// Teksten som vises der serveroppsettet er låst.
    static let note: String = "Settes opp av administrator"

    /// Samme liste som SERVER_KEYS på serveren (server/finans/db.js).
    static let serverKeys: Set<String> = ["provider", "fallback", "ollamaUrl", "ollamaModel", "ollamaTextModel", "geminiModel", "groqModel", "groqVisionModel",
                                          "roboflowWorkflow", "roboflowWorkspace", "roboflowModel", "roboflowBarcodeModel", "minConf", "aiTasks", "ocrFallback",
                                          "ocrLowConf", "aiTimeouts", "embedModel", "aiSearchEmbed", "boligAiNew", "smbOn", "smbShare", "smbDir", "smbVersion",
                                          "smbUser", "smbDomain", "smbSchedule", "smbKeep", "smbDb", "smbReceipts", "smbSettings", "smbEncrypt"]

    static func isServerKey(_ k: String) -> Bool { serverKeys.contains(k) }
}

extension Store {
    /// Kan denne kontoen endre serveroppsettet? Fra bootstrap (canEditServer). Eldre server uten feltet: admin-rollen avgjør.
    var canEditServer: Bool {
        if let b: Bool = boot?.canEditServer { return b }
        let r: String = me?.role ?? account?.role ?? ""
        return r.isEmpty || r == "admin"
    }
}
