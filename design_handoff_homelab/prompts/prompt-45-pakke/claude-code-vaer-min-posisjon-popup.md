# Vær-popup: vis også været der enheten er

Fasit: `Vaer.dc.html`.

- Vær-popupen (fra Hjem-kortet/widget) viser nå **to** steder: valgt sted + **«Min posisjon»** (enhetens faktiske posisjon).
- Min posisjon hentes fra enheten som har appen åpen (iOS/Android: posisjonstillatelse; web/Mac: nettleserens Geolocation). Ikke fra serveren eller en annen enhet.
- Visning: eget kort øverst med pil-ikon «MIN POSISJON», stedsnavn (omvendt geokoding), temperatur, symbol, H/L.
- Er posisjon avslått: kortet viser «Slå på posisjon for å se været der du er» + knapp «Tillat».
- Er valgt sted = min posisjon (innen 2 km), vis bare ett kort.
- Oppdater når appen kommer i forgrunnen (maks hvert 10. min).
