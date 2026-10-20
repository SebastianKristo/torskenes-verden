import Foundation
import UIKit
import UserNotifications
import Intents

/* ---------------- Prompt 39: Glimt-varsel med Glimt-logoen (claude-code-glimt-varsel-ikon.md) ---------------- */
// iOS viser alltid app-ikonet på et vanlig varsel. To måter å få Glimt-logoen på:
//  1. Communication Notification: INSendMessageIntent med Glimt som avsender og INImage = logoen, og
//     UNNotificationContent.updating(from:). Da vises logoen stort og app-ikonet lite i hjørnet.
//     Krever entitlementen com.apple.developer.usernotifications.communication (og NSUserActivityTypes = INSendMessageIntent)
//     i App ID-en. FinansHub.entitlements har den IKKE i dag (gratis/ukjent signeringsteam), så den er av som standard:
//     sett `communication = true` når capability-en «Communication Notifications» er lagt til i project.yml.
//  2. Reserve (brukes nå): UNNotificationAttachment med logoen (miniatyrbilde til høyre i varselet).
// Logoen ligger i appen som glimt-varsel39.png (vedlegg/glimt-varsel.png, 192 × 192, papirbakgrunn).

enum GlimtNotify39 {
    /// Slå på når entitlementen for Communication Notifications er på plass.
    nonisolated static let communication: Bool = false

    nonisolated static func logoData() -> Data? {
        guard let url = Bundle.main.url(forResource: "glimt-varsel39", withExtension: "png") else { return nil }
        return try? Data(contentsOf: url)
    }

    /// Kopi av logoen i tmp (vedlegg flyttes inn i varsel-lageret, så hver gang trenger sin egen fil).
    nonisolated static func logoAttachment() -> UNNotificationAttachment? {
        guard let data = logoData() else { return nil }
        let name: String = "glimt-" + UUID().uuidString + ".png"
        let url: URL = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        do {
            try data.write(to: url)
            return try UNNotificationAttachment(identifier: "glimt-logo", url: url, options: nil)
        } catch {
            return nil
        }
    }

    /// Tittel «Glimt» og Glimt-logoen. Returnerer innholdet som skal legges i varselforespørselen.
    nonisolated static func decorate(_ c: UNMutableNotificationContent, chatId: String) -> UNNotificationContent {
        if c.title.isEmpty { c.title = "Glimt" }
        if communication, let updated = communicationContent(c, chatId: chatId) {
            return updated
        }
        if let a = logoAttachment() { c.attachments = [a] }
        return c
    }

    /// INSendMessageIntent med Glimt som avsender (bare når entitlementen er på plass).
    nonisolated static func communicationContent(_ c: UNMutableNotificationContent, chatId: String) -> UNNotificationContent? {
        var image: INImage? = nil
        if let d = logoData() { image = INImage(imageData: d) }
        let handle: INPersonHandle = INPersonHandle(value: "glimt", type: .unknown)
        let sender: INPerson = INPerson(personHandle: handle, nameComponents: nil, displayName: "Glimt", image: image,
                                        contactIdentifier: nil, customIdentifier: "glimt")
        let intent: INSendMessageIntent = INSendMessageIntent(recipients: nil, outgoingMessageType: .outgoingMessageText,
                                                              content: c.body, speakableGroupName: nil,
                                                              conversationIdentifier: chatId.isEmpty ? "glimt" : chatId,
                                                              serviceName: nil, sender: sender, attachments: nil)
        if let image { intent.setImage(image, forParameterNamed: \.sender) }
        let interaction: INInteraction = INInteraction(intent: intent, response: nil)
        interaction.direction = .incoming
        interaction.donate(completion: nil)
        do {
            return try c.updating(from: intent)
        } catch {
            return nil
        }
    }
}
