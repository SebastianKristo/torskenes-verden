import SwiftUI
import UIKit

/* ---------------- Prompt 42: scroll over sveipbare kort på Hjem ---------------- */
// «Dagens bibelvers», briefen og «Min reise» kunne sveipes bort mot høyre. Et loddrett drag som starter på kortet skal
// alltid scrolle siden.
//
// 4.39.2: på iOS 18+ har vi ingen egen sveip-gest lenger. Både SwiftUI-DragGesture (4.36), UIGestureRecognizerRepresentable
// via .gesture (4.37–4.39.0: Hjem kunne ikke scrolles) og en UIKit-pan lagt på ScrollView-en (4.39.1: ingen sider kunne
// scrolles) konkurrerte med scrollen på ekte iPhone. Kortene skjules i stedet med hold → «–» (wiggle) eller handlingen i
// VoiceOver. iOS 17: DragGesture med retningslås som før (der slipper scrollen gjennom).

extension View {
    /// Vannrett sveip: `changed` får forflytningen, `ended` farten (pt/s). Bare på iOS 17; på iOS 18+ er kortet uten gest.
    @ViewBuilder func hSwipe42<G: Gesture>(_ fallback: G, changed: @escaping (CGSize) -> Void, ended: @escaping (CGFloat) -> Void) -> some View {
        if #available(iOS 18.0, *) {
            self
        } else {
            self.simultaneousGesture(fallback)
        }
    }
}
