// Leser all konfigurasjon fra miljøvariabler. Hemmeligheter forlater aldri serveren.
import { readFileSync, existsSync } from 'node:fs';

// Enkel .env-leser slik at `npm start` fungerer uten ekstra pakker.
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const env = (k, d = '') => process.env[k] ?? d;

export const config = {
  port: Number(env('PORT', '3000')),
  dataDir: env('DATA_DIR', './data'),
  secureCookies: env('COOKIE_SECURE', 'true') !== 'false',
  passwordHash: env('APP_PASSWORD_HASH'),
  sessionSecret: env('SESSION_SECRET'),
  userName: env('USER_NAME'),
  trading212Key: env('TRADING212_API_KEY'),
  trading212Base: env('TRADING212_BASE', 'https://live.trading212.com'),
  ha: {
    url: env('HA_URL').replace(/\/$/, ''),
    token: env('HA_TOKEN'),
    power: env('HA_SENSOR_POWER', 'sensor.power_now'),
    energyDaily: env('HA_SENSOR_ENERGY_DAILY', 'sensor.energy_daily'),
    price: env('HA_SENSOR_PRICE', 'sensor.nordpool_kwh_oslo_nok'),
  },
  icalUrl: env('SCHOOL_ICAL_URL'),
  mazemapCampusId: env('MAZEMAP_CAMPUS_ID'),
  schoolUrl: env('SCHOOL_URL', 'https://www.vilbli.no'),
  nasaKey: env('NASA_API_KEY', 'DEMO_KEY'),
  enturClient: env('ENTUR_CLIENT_NAME', 'benjamin-homelab'),
  metUserAgent: env('MET_USER_AGENT', 'homelab-dashboard/1.0 benjamin@kristo.no'),
  location: { lat: Number(env('LAT', '59.9139')), lon: Number(env('LON', '10.7522')), name: env('PLACE', 'Oslo') },
  services: [
    ['Ruter', env('ROUTER_URL', 'http://192.168.1.1')],
    ['Home Assistant', env('HA_URL', 'http://192.168.1.20:8123')],
    ['Proxmox', env('PROXMOX_URL', 'https://192.168.1.10:8006')],
    ['Pi-hole', env('PIHOLE_URL', 'http://192.168.1.30/admin')],
    ['NAS', env('NAS_URL', 'http://192.168.1.40:5000')],
    ['Homey', env('HOMEY_URL', 'https://my.homey.app')],
    ['LabDeck', env('LABDECK_URL', 'http://192.168.1.50')],
  ].filter(([, url]) => url),
};

if (!config.passwordHash) console.warn('[config] APP_PASSWORD_HASH er ikke satt – en tom server viser førstegangsoppsettet på /login.');
if (!config.sessionSecret || config.sessionSecret.length < 32) console.warn('[config] SESSION_SECRET bør være minst 32 tegn.');
