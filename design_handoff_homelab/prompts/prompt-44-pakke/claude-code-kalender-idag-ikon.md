# Kalender (web + app): «I dag»-ikonet

Ønske 2026-10-21: «i kalender app og web denne ikonet er feil» (vedlegg `uploads/Screenshot 2026-10-21 at 13.38.06.png`: tallet «21» la seg over strekene i kalenderikonet).
Fasit: `Kalender.dc.html` (knappen «I dag» i toppfeltet).

- Ikon 24 × 24: avrundet ramme (6 pt hjørner, 1,8 pt strek i tekstfarge), **rød topp-stripe 6 pt** (`#b23a2a`), dagens tall **midtstilt** i feltet under (Manrope 800, 10,5 pt). Ingen ringer eller streker som krysser tallet.
- Tallet er alltid dagens dato og oppdateres ved midnatt.
- Native: tegn som `RoundedRectangle` + rektangel + `Text` (SwiftUI) / `Box` (Compose). Ikke bruk SF Symbol/Material-ikon med tall lagt over.
