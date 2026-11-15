// Kalender og Bursdager: monterer alle rutene i domenet. server/index.js kaller funksjonene nøyaktig der de gamle
// monteringene sto, fordi rekkefølgen er bærende (Hono kjører handlere og mellomvare i registreringsrekkefølge):
//   mountBirthdays(app)      – /api/birthdays (bilder før resten), /api/widgets/birthdays og /api/apps/kalender (oppdatering av appen)
//   mountKalenderFront(app)  – rutene som må stå før /api/kalender og før de innebygde kalenderne fra Media og Abonnementer
//   mountKalender(app)       – kalenderlista, hendelsene, vær, widget, companion-token og selve /api/kalender (etter mellomvarene
//                              mediaCalendarsMw43 og abCalendarsMw42, som legger «Media» og «Abonnementer» inn i kalenderlista)
// Filene:
//   events.js         – kildene (skolens iCal, Canvas, Bursdager, Google, lokale), eventsFor, CRUD, søk, /api/kalender og widget-grunnsvaret
//   ical.js           – iCal-tolking og utvidelse av gjentakelser (RRULE, tidssoner)
//   calendars.js      – Kalender-appens kalendere (visning, farger, egne), appCalendar på hendelser, vær 16 dager, widget-tillegget,
//                       companion-token og Glimt i Kalender (/api/assist source:'calendar')
//   four-calendars.js – de fire kalenderne (Personlig, Bursdager, Skole, Helligdager), opprydding/angre, skole-URL, Google-velgeren
//   external.js       – egne kalendere fra iCal-abonnement og Home Assistant
//   google.js         – Google-kalendere i Kalender-appen (hovedkalender og flere kalendere)
//   subjects.js       – fagfarger, prøve/eksamen/frist og adresse + kart på hendelser
//   invites.js        – deltakere og invitasjoner (.ics), konflikter (etag), brukerliste og adresseforslag
//   glimt.js          – «Beskriv med Glimt» og ✦ Spør i kalendersøket
//   glimt-search.js   – søk med Glimt (POST /api/kalender/glimt/search) og testvarsel
//   quick.js          – rask time (AI-jobbkø)
//   app-update.js     – oppdatering av Kalender-appen (GitHub-releasene)
//   birthdays.js      – Bursdager (Google, Home Assistant, påminnelser, widget)
//   birthday-photos.js – bilder av personer i Bursdager
import { authOrToken } from '../mobile.js';
// Importrekkefølgen følger den gamle rekkefølgen i server/index.js: modulene registrerer kilder og dekoratører i events.js
// når de lastes (subjects før invites osv.), og rekkefølgen bestemmer feltrekkefølgen i hendelsene.
import birthdaysApi, { widgetOut as birthdaysWidget } from './birthdays.js';
import calendarApi from './events.js';
import calendarQuickApi from './quick.js';
import kal37Api from './subjects.js';
import { cals39Api, googleMap39Api } from './four-calendars.js';
import { birthdays41Api } from './birthday-photos.js';
import { kalender41Api } from './glimt-search.js';
import { kalUpdate43Api } from './app-update.js';
import { kal44Api, kalEventsMw44 } from './invites.js';
import { haApi as kal35HaApi } from './external.js';
import { describeApi as calendarDescribeApi, searchAiMiddleware as calendarSearchAi } from './glimt.js';
import { calendarsApi as kalCalendarsApi, weatherApi as kalWeatherApi, eventsMiddleware as kalEventsMw, widgetApi as calendarWidgetApi, companionApi } from './calendars.js';

/** Bursdager (per bruker, Google Kalender og Home Assistant) med bilder av personer, widget-svaret og oppdatering av Kalender-appen. */
export function mountBirthdays(app) {
  app.route('/api/birthdays', birthdays41Api); // bilder av personer (før resten av /api/birthdays)
  app.route('/api/birthdays', birthdaysApi);
  app.get('/api/widgets/birthdays', authOrToken, (c) => c.json(birthdaysWidget(c.get('user'))));
  app.route('/api/apps/kalender', kalUpdate43Api); // /latest?platform=mac|android&channel=stabil|beta (uinnlogget) og /:versjon/:fil
}

/** Rutene som må stå før /api/kalender og før de innebygde kalenderne (Media, Abonnementer). */
export function mountKalenderFront(app) {
  app.route('/api', kal44Api); // /kalender/events/:id/invite, /kalender/invites, /users/directory, /geo/address
  app.route('/api', kalender41Api); // /kalender/glimt/search, /calendar/ask, /kalender/notify/test, /push/test
  app.route('/api/kalender/describe', calendarDescribeApi); // «Beskriv med Glimt»
  app.use('/api/kalender/search', calendarSearchAi); // ?ai=1 → Glimt-svar, ellers det vanlige søket
  app.route('/api/kalender/quick', calendarQuickApi);
  app.route('/api/kalender/ha', kal35HaApi);
  app.route('/api/kalender', kal37Api); // /subjects (fagfarger) og /geo (adresse + kart)
}

/** Kalenderlista, hendelsene, vær, widget og /api/kalender. Etter mellomvarene for de innebygde kalenderne. */
export function mountKalender(app) {
  app.route('/api/kalender/calendars', cals39Api); // fire kalendere, opprydding/angre, nye felt (før calendars.js)
  app.route('/api/kalender/google', googleMap39Api); // GET/PUT /mapping
  app.route('/api/kalender/calendars', kalCalendarsApi);
  app.route('/api/kalender/weather', kalWeatherApi);
  // Hendelser: først invites.js (attendees og geo, etag-konflikter, avlysning ved sletting), så calendars.js (appCalendar,
  // sanntid «kalender»), så handlerne i events.js.
  app.use('/api/kalender/events', kalEventsMw44, kalEventsMw);
  app.use('/api/kalender/events/*', kalEventsMw44, kalEventsMw);
  app.route('/api/tokens/companion', companionApi); // «Logg inn med Homelab-appen»: eget token for Kalender (økt eller token med finance:write)
  app.route('/api/calendar/quick', calendarQuickApi);
  app.route('/api/kalender', calendarApi);
  app.route('/api/widgets/calendar', calendarWidgetApi); // grunnsvaret (events.js) + Kalender-appens tillegg (calendars.js) i én handler
}
