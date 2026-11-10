import SwiftUI
import UIKit

/* ---------------- Prompt 84: Kalender inni Homelab-appen («Kalender i appen») ---------------- */
// Hele Kalender-appen (samme kode, samme skjermer) kompileres også inn i Homelab-appen (FinansHub-målet) med flagget
// KAL_EMBED (project.yml). Der er den en fullskjerm som Homelab åpner (Kal84Embed.swift i FinansHub/Sources).
// Denne fila er med i begge iOS-målene; i den frittstående Kalender-appen er alt her av (host og login er nil, notify brukes ikke).
// Bak KAL_EMBED (av i Homelab): @main/KalApp, App Intents/Snarveier (KalIntent.swift), BGTask-registreringen (KalBg44),
// varselkategoriene og varsel-delegaten (KalNotify), krasjfangeren (KalCrash51), kalender://-lenker (onOpenURL), widget-reload
// (KalW70), «Nytt i denne versjonen», «Kalender på hjemskjermen», Widgets-innstillingene og oppdateringsinfoen (TestFlight/IPA).

@MainActor
final class KalEmbed84 {
    static let shared: KalEmbed84 = KalEmbed84()

    /// true i Homelab-appen (FinansHub-målet), false i den frittstående Kalender-appen.
    nonisolated static var on: Bool {
        #if KAL_EMBED
        return true
        #else
        return false
        #endif
    }

    /// Fullskjermen (UIHostingController) Homelab viser Kalender i. Temaet (System / Lys / Mørk) settes bare på den.
    weak var host: UIViewController? = nil
    /// «Logg inn med Homelab-appen» innebygd: Homelab logger inn med sin egen konto (ingen app-bytte til seg selv).
    var login: (@MainActor () -> Void)? = nil
    /// Lokale påminnelser planlegges bare når den frittstående Kalender-appen ikke er installert (ellers dobbelt opp).
    var notify: Bool = false

    /// Tema på Kalender-fullskjermen. «System» følger telefonen (skjermens stil), ikke Homelabs eget tema.
    func apply(_ style: UIUserInterfaceStyle) {
        guard let h = host else { return }
        var s: UIUserInterfaceStyle = style
        if s == .unspecified, let scene = h.view.window?.windowScene {
            s = scene.screen.traitCollection.userInterfaceStyle
        }
        if h.overrideUserInterfaceStyle != s { h.overrideUserInterfaceStyle = s }
    }
}
