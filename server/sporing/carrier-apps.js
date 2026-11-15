// App-verdiene for kontoinnloggingen hos Posten, Bring og PostNord (Q22). Samlet her, ute av koden i accounts.js, så de kan
// byttes uten kodeendring når en transportør roterer dem: sett variablene under i .env (eller i miljøet til containeren).
// Tom eller manglende variabel = dagens verdi.
//
// Verdiene er transportørenes egne app-verdier, slik de åpne Home Assistant-integrasjonene (ha-postnord, ha-posten-bring)
// bruker dem: PostNord er en offentlig PKCE-klient med en gateway-nøkkel, Posten-ID/Bring er Basic-autentiserte app-klienter.
// De er ikke brukerhemmeligheter, men de sendes aldri til klientene og logges aldri. Risikoen står i docs/sikkerhet.md.
// Vertene (account.postnord.com, id.posten.no, login.bring.com …) og redirect-adressene (com.postnord.app://, posten://, bring://,
// som appene fanger opp i innloggingsvinduet) er faste i accounts.js og kan ikke overstyres.
//
//   SPORING_POSTNORD_CLIENT_ID  SPORING_POSTNORD_API_KEY
//   SPORING_POSTEN_CLIENT_ID    SPORING_POSTEN_SECRET
//   SPORING_BRING_CLIENT_ID     SPORING_BRING_SECRET
import '../config.js'; // .env leses før verdiene under

const DEFAULTS = {
  postnord: { clientId: 'receiverappprod3gvTgY5ATtYWZZy', apiKey: '1ecf161be47543b19fce03f953a6e8d2' },
  posten: { clientId: 'f0ad2360e9f64a0986faafe66a9731e5', secret: 'b814595805d5859ebe1d69abd2e65b0d8f4b786478bb31b5bfeefb5dc5dc1b1be8dae22d83d4195f' },
  bring: { clientId: 'ffb3cd07a5a043a5977b7e272a06bb8f', secret: '0b00ac6b4c474c0ea087552341f10a1446592b94dada40cbbdba97aa84cfe5bb41cba49339582' },
};
const ENV = { clientId: 'CLIENT_ID', apiKey: 'API_KEY', secret: 'SECRET' };

/** Verdiene for én transportør med overstyringene fra miljøet. Ren funksjon av env (testbar). */
export function carrierApp(carrier, env = process.env) {
  const base = DEFAULTS[carrier];
  if (!base) throw new Error(`Ukjent transportør: ${carrier}`);
  return Object.fromEntries(Object.entries(base).map(([k, v]) => [k, String(env[`SPORING_${carrier.toUpperCase()}_${ENV[k]}`] ?? '').trim() || v]));
}

/** Verdiene som gjelder i denne prosessen (leses én gang ved oppstart). */
export const CARRIER_APPS = Object.freeze({ postnord: Object.freeze(carrierApp('postnord')), posten: Object.freeze(carrierApp('posten')), bring: Object.freeze(carrierApp('bring')) });
