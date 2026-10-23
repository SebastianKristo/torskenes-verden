# Familie → Helse: importer helsedata fra Home Assistant (Mobilapp-integrasjonen)

Ønske 2026-10-20: «helsedata: la meg importere helsedata fra mobilappen i Home Assistant» (vedlegg `uploads/Screenshot 2026-10-20 at 21.51.29.png`: HA → Mobilapp, 10 enheter / 796 entiteter: Cybele OnePlus 12, Rune iPhone 13, Rune OnePlus 8, Samsung S26 Ultra, Sebastian iPad Pro, Sebastian iPhone 17 Pro …).
Fasit i designet: `Mobil Papir App.dc.html` → Innstillinger → **Helse (Familie)** → «Home Assistant · Mobilapp».

## Hvorfor
Alle i familien har allerede HA Companion-appen. Da kan Homelab lese helsesensorene derfra, uten at alle må installere Homelab-appen og gi HealthKit/Health Connect-tilgang.

## Kilde
- Bruk den eksisterende Home Assistant-integrasjonen (URL + long-lived token fra Innstillinger → Integrasjoner).
- `GET /api/states` (eller WebSocket `subscribe_entities`). Filtrer på enheter fra integrasjonen `mobile_app` (`/api/config/device_registry/list` via WS → `config_entries` med domain `mobile_app`).
- **Android (Health Connect-sensorer i Companion):** `sensor.<enhet>_steps`, `_heart_rate`, `_resting_heart_rate`, `_sleep_duration`, `_active_calories_burned`, `_total_calories_burned`, `_distance`, `_floors_climbed`, `_weight`, `_body_fat`, `_oxygen_saturation`, `_respiratory_rate`, `_blood_glucose`, `_vo2_max` (de som er slått på i appen).
- **iOS (Companion):** ingen HealthKit-sensorer. Tilgjengelig er `sensor.<enhet>_steps`, `_distance`, `_floors_ascended`, `_floors_descended`, `_average_active_pace`, `_activity` (Stationary/Walking/Running/Automotive/Cycling) + batteri. Vis «Begrenset på iPhone: bare skritt, etasjer og aktivitet fra HA. Puls og søvn krever Homelab-appen (Apple Health).»
- Enheter uten helsesensorer (f.eks. iPad) vises nedtonet: «Ingen helsesensorer».

## Oppsett (Innstillinger → Helse (Familie) → Home Assistant · Mobilapp)
1. Liste over HA-enhetene (navn, modell, «133 entiteter», antall helsesensorer funnet).
2. **Koble til person:** velg familiemedlem per enhet (forslag fra navnet: «Rune iPhone 13» → Rune). Én person kan ha flere enheter (Rune: iPhone 13 + OnePlus 8). Da slås data sammen med prioritet: Health Connect > iOS-pedometer, og høyeste verdi for skritt per dag (ingen dobbelttelling).
3. **Velg sensorer** med avkrysning (forhåndsvalgt: skritt, puls, hvilepuls, søvn, aktive kalorier, aktivitet).
4. **Lagre**. Første synk henter 30 dager historikk via `/api/history/period/<start>?filter_entity_id=…`.

## Synk og visning
- Live via WebSocket. Lagre dagsaggregater i `health_daily(person_id, date, metric, value, source:'ha:<device_id>')`.
- Familie → Helse viser kilden under navnet: «Fra Home Assistant · OnePlus 12 · oppdatert 2 min siden».
- Personvern: hver person må godkjenne deling første gang (varsel i appen / HA-varsel via `notify.mobile_app_<enhet>`: «Homelab vil vise skritt og søvn til familien. Tillat?»). Kan trekkes tilbake når som helst.
- Feil: utløpt token → «Koble til Home Assistant på nytt». Sensor `unavailable` i 6 timer → «Ingen data fra Rune iPhone 13 siden 14:20».
