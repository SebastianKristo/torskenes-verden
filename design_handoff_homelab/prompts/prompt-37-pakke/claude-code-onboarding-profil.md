# Onboarding: koble en innlogget bruker til en profil i husstanden

Ønske 2026-10-20: «i onboarding la meg koble en profil til en bruker.»
Fasit: `Onboarding.dc.html` (4 steg, mobil først, maks 440 px).

## Begreper
- **Bruker** = innlogging (brukernavn/passord, passkey, enheter).
- **Profil** = personen i husstanden (navn, farge/avatar, Familie-posisjon og soner, medlemskap i delte gjøremålslister og abonnementer, kalendere, helse).
  - En profil kan finnes **uten** bruker (f.eks. Pål og mormor i Familie, eller Ingrid før hun har fått app).
  - En bruker kobles til **nøyaktig én** profil.

## Steg
1. **Velkommen + logg inn:** «Velkommen hjem. Du er koblet til home.kristo.no …», brukernavn og passord, **Logg inn**.
2. **Hvem er du?**
   - Liste over husstandens profiler: avatar, navn og hva profilen har (posisjon, delte lister, abonnementer).
   - Profiler som allerede er koblet til en annen bruker, er dempet: «Koblet til @sebastian».
   - ✦ Glimt foreslår profilen med samme navn som brukernavnet (forhåndsvalgt).
   - **Jeg er ny i husstanden** gir navnefelt og lager en ny profil.
   - Knapp: **Dette er meg** / **Lag profil**.
3. **Dette kobles til deg:** profilkort «@ingrid ⟷ profil» + brytere for:
   - Posisjon og Familie-kart
   - Gjøremål (delte lister)
   - Delte abonnementer («Starlink · din del 400 kr/mnd»)
   - Kalendere
   - Helse (Apple Health / Health Connect på denne enheten, av som standard)
   - Under står: «Du kan endre koblingen senere i Innstillinger → Konto → Profil. Admin får beskjed om nye koblinger.» Knapp: **Koble og fortsett**.
4. **Ferdig:** avatar som spretter inn, «Hei, Ingrid!», oppsummering og **Gå til Hjem**.

## Backend
- `profiles {id, name, color, avatar, user_id NULL UNIQUE}`. Data som i dag henger på navn eller `user_id` (Familie-posisjon, `todo_list_members`, `subscription_members`, kalendere), flyttes til `profile_id`.
- `POST /api/onboarding/link {profile_id | new_profile_name, consents}` setter `profiles.user_id` i én transaksjon. Den feiler hvis profilen allerede er koblet (409). Push til admin: «@ingrid koblet seg til profilen Ingrid».
- **Admin-styring:** Innstillinger → Brukere → [bruker] → **Profil**: koble, bytt eller koble fra. Admin kan låse at bare admin kobler. Da viser steg 2 «Admin har koblet deg til Ingrid», bare med bekreft-knapp.
- **Samtykker** (posisjon og helse) lagres per profil. Posisjonsdeling krever OS-tillatelse rett etter steg 3 (iOS: «Alltid» forklares først).
- Glimt, Hilsen, Now Brief og Bibelvers (bare Sebastian) bruker **profilen** (navn og innstillinger), ikke brukernavnet.
