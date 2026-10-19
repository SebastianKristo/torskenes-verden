# Vær: to flytende knapper nederst (ikke grå bunnlinje)

Fasit: `Vaer.dc.html` → bunnen av skjermen.

## Feil
Kart- og Steder-knappene lå i en grå/blurret bunnlinje over hele bredden. Det skal ikke være noen linje.

## Riktig
- **To separate runde knapper**, som før: Kart (venstre) og Steder ☰ (høyre). Ingen bakgrunn eller kant mellom dem, værbakgrunnen synes helt ned.
- Størrelse 52×52, radius 26. Glass: `rgba(10,20,35,.34)` + blur 20 px / saturate 1.4, kant `1px rgba(255,255,255,.22)`, skygge `0 8px 24px -10px rgba(0,0,0,.45)`. Ikon hvitt 24 px.
- Plassering: 18 px fra sidene, **nær bunnen**: `6px + safe-area-inset-bottom` (rett over hjem-indikatoren på iPhone).
- Containeren har `pointer-events: none`, kun knappene er trykkbare, så man kan scrolle innholdet bak.
- iOS: `.safeAreaInset(edge: .bottom)` med `HStack { kart; Spacer(); steder }` og `.glassEffect()`/`.ultraThinMaterial` per knapp.
