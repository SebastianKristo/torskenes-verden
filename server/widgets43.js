// Prompt 43 (SERVER43): widgets (claude-code-media-widgets.md, claude-code-widget-galleri.md, Media Widgets.dc.html, Widget Galleri.dc.html).
//   GET /api/widgets/media   → samme som /api/media/widget (aktiv kø + 3 neste, cache 60 s); uten Media-tilgang {configured:false, hide:true}
//   GET /api/widgets/catalog?platform=ios|android[&samsung=1] → {platform, style, intro, filters:[{id, label}], groups:[{id, name, data, widgets:[Widget]}], count}
//       Widget = {id, group, name, size:'small'|'medium'|'large'|'lock-rect'|'lock-circle'|'lock-inline', sizeLabel, kind, families?, receiver?, cells?, data, lock}
import { Hono } from 'hono';
import { authOrToken } from './mobile.js';
import { mediaAllowed43, mediaWidget43 } from './media43.js';

const IOS_SIZE = { small: 'Liten', medium: 'Medium', large: 'Stor', 'lock-rect': 'Låseskjerm', 'lock-circle': 'Låseskjerm · rund', 'lock-inline': 'Låseskjerm · linje' };
const FAMILY = { small: 'systemSmall', medium: 'systemMedium', large: 'systemLarge', 'lock-rect': 'accessoryRectangular', 'lock-circle': 'accessoryCircular', 'lock-inline': 'accessoryInline' };
// [gruppe, navn, data-API, iOS: [kind, størrelser], iOS lås: [kind, størrelser] | null, Android: [[receiver, celler]]]
const GROUPS = [
  ['media', 'Media', '/api/widgets/media', ['MediaWidget', ['small', 'medium', 'large']], ['MediaLockWidget', ['lock-rect', 'lock-circle', 'lock-inline']], [['MediaSmallReceiver', '2 × 2', 'small'], ['MediaMediumReceiver', '4 × 2', 'medium'], ['MediaLargeReceiver', '4 × 3', 'large']], 'Nedlastinger og det som kommer'],
  ['avganger', 'Avganger', '/api/widgets/departures', ['DeparturesWidget', ['small', 'medium']], ['DeparturesLockWidget', ['lock-rect', 'lock-inline']], [['DeparturesReceiver', '4 × 2', 'medium']], 'Neste avganger fra stoppene dine'],
  ['kalender', 'Kalender', '/api/widgets/calendar', ['CalendarWidget', ['small', 'medium', 'large']], ['CalendarLockWidget', ['lock-rect', 'lock-inline']], [['CalendarReceiver', '4 × 4', 'large']], 'Dagens og ukas avtaler'],
  ['prove', 'Prøveperioder', '/api/widgets/trials', ['TrialWidget', ['small', 'medium']], ['TrialLockWidget', ['lock-rect', 'lock-circle']], [['TrialReceiver', '4 × 2', 'medium']], 'Gratisperioder som snart går ut'],
  ['pakker', 'Pakker', '/api/tracking/widget', ['ParcelsWidget', ['small', 'medium']], null, [['ParcelsReceiver', '4 × 2', 'medium']], 'Sporing av pakker på vei'],
  ['brief', 'Glimt-brief', '/api/brief/widget', ['BriefWidget', ['small', 'medium', 'large']], ['BriefLockWidget', ['lock-rect']], [['BriefReceiver', '4 × 2', 'medium']], 'Dagens brief fra Glimt'],
];
const ANDROID_SIZE = { '2 × 2': 'small', '4 × 2': 'medium', '4 × 3': 'large', '4 × 4': 'large' };
export function widgetCatalog43(platform = 'ios', { samsung = false, media = true } = {}) {
  const ios = platform !== 'android';
  const groups = GROUPS.filter(([id]) => media || id !== 'media').map(([id, name, data, home, lock, android, sub]) => {
    const widgets = ios
      ? [...home[1].map((size) => ({ id: `${home[0]}.${size}`, group: id, name, size, sizeLabel: IOS_SIZE[size], kind: home[0], family: FAMILY[size], data, lock: false })),
        ...(lock ? lock[1].map((size) => ({ id: `${lock[0]}.${size}`, group: id, name, size, sizeLabel: IOS_SIZE[size], kind: lock[0], family: FAMILY[size], data, lock: true })) : [])]
      : android.map(([receiver, cells, size]) => ({ id: receiver, group: id, name, size: ANDROID_SIZE[cells] ?? size, sizeLabel: cells, kind: receiver, receiver, provider: `no.kristo.finanshub.widgets.${receiver}`, cells, data, lock: false,
        ...(id === 'media' && receiver === 'MediaMediumReceiver' ? { action: 'Pause alt' } : {}) }));
    return { id, name, sub, data, widgets };
  });
  return {
    platform: ios ? 'ios' : 'android', style: ios ? 'ios' : samsung ? 'samsung' : 'material',
    intro: ios ? 'Hold inne på Hjem-skjermen → + → søk «Homelab» → velg størrelse → Legg til widget. Låseskjerm: Tilpass → Låseskjerm → feltet under klokka.'
      : 'Trykk «Legg til på startskjermen». Systemet spør om du vil legge den til.',
    addMode: ios ? 'steps' : 'pin',
    steps: ios ? ['Hold inne på Hjem-skjermen til ikonene vibrerer', 'Trykk + øverst til venstre og søk «Homelab»', 'Velg størrelse og trykk Legg til widget'] : [],
    filters: [{ id: 'all', label: 'Alle' }, ...groups.map((g) => ({ id: g.id, label: g.name }))],
    groups, count: groups.reduce((a, g) => a + g.widgets.length, 0),
  };
}

export const widgets43Api = new Hono();
widgets43Api.get('/media', authOrToken, async (c) => {
  const u = c.get('user');
  if (!mediaAllowed43(u)) return c.json({ configured: false, hide: true, restricted: true, downloads: [], upcoming: [] });
  try { return c.json(await mediaWidget43(u), 200, { 'Cache-Control': 'private, max-age=30' }); } catch (e) { return c.json({ configured: false, hide: true, error: e.message, downloads: [], upcoming: [] }); }
});
widgets43Api.get('/catalog', authOrToken, (c) => {
  const p = String(c.req.query('platform') ?? 'ios').toLowerCase();
  if (!['ios', 'android'].includes(p)) return c.json({ error: 'platform må være ios eller android' }, 400);
  return c.json(widgetCatalog43(p, { samsung: /^(1|true)$/.test(c.req.query('samsung') ?? ''), media: mediaAllowed43(c.get('user')) }));
});
