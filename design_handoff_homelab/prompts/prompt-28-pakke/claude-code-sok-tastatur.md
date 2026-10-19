# Søk: litt luft mellom tastatur og fanelinje

Gjelder: Finans → Søk (og alle sider der fanelinjen følger tastaturet).

- Når tastaturet er åpent ligger fanelinjen i dag kant i kant med toppen av tastaturet. Legg inn **8 pt** mellomrom.
- iOS (SwiftUI): fanelinjen i `.safeAreaInset(edge: .bottom)` med `.padding(.bottom, keyboardVisible ? 8 : safeBottom)`. Les `keyboardVisible` fra `UIResponder.keyboardWillShowNotification` / `WillHide`, og animer med tastaturets `animationDuration` og `curve`.
- Android (Compose): `Modifier.imePadding().padding(bottom = if (imeVisible) 8.dp else 0.dp)`, der `imeVisible = WindowInsets.isImeVisible`.
- Web/PWA: `bottom = (innerHeight - visualViewport.height - visualViewport.offsetTop) + 8px` mens tastaturet er åpent.
- Skuggen under fanelinjen beholdes, så den ikke smelter sammen med tastaturet.
- Skann-knappen (FAB) flytter seg med fanelinjen og holder samme avstand over den.
