// Tailscale: eksempeldata (MOCK_DATA=1) i samme form som GET /localapi/v0/status, så demoen går gjennom den vanlige
// normaliseringen. Navn, nøkler og adresser er oppdiktet. Brukes bare når verken socketen eller en API-nøkkel finnes.
const DAY = 86_400_000;
const iso = (t) => new Date(t).toISOString();
const NEVER = '0001-01-01T00:00:00Z';

// [id, vertsnavn, MagicDNS-navn, OS, bruker, tags, online, sist sett (dager siden), tunnel ('d' = direkte, ellers relay), nøkkel utløper (dager), exit-node]
const PEERS = [
  ['nUNRAID', 'unraid', 'unraid', 'linux', 1, ['tag:server'], true, 0, 'd', 40, false],
  ['nPROXMOX', 'proxmox', 'proxmox', 'linux', 1, ['tag:server'], true, 0, 'd', 120, false],
  ['nPIHOLE', 'pihole', 'pihole', 'linux', 1, ['tag:server'], true, 0, 'd', 6, false],
  ['nHYTTA', 'hytta-pi', 'hytta', 'linux', 1, ['tag:server'], false, 2.6, 'osl', 200, false],
  ['nHA', 'homeassistant', 'homeassistant', 'linux', 1, ['tag:iot'], true, 0, 'd', null, false],
  ['nMBP', 'Sebastians-MacBook-Pro', 'sebastians-macbook-pro', 'macOS', 1, [], true, 0, 'osl', 300, true],
  ['nSTUE', 'stue-pc', 'stue-pc', 'windows', 1, [], true, 0, 'd', 90, false],
  ['nIPHONE', 'localhost', 'iphone-15', 'iOS', 2, [], true, 0, 'ams', 12, false],
  ['nIPAD', 'Ingrids-iPad', 'ingrids-ipad', 'iOS', 2, [], false, 45, 'osl', 150, false],
  ['nPIXEL', 'pixel-8', 'pixel-8', 'android', 2, [], false, 0.2, 'osl', 80, false],
];

/** Demo-status for «nå» (ms). */
export function demoStatus(now = Date.now()) {
  const peer = ([id, host, dns, os, user, tags, online, ago, tun, keyDays, exit], i) => [`nodekey:demo${i}`, {
    ID: `${id}CNTRL`, PublicKey: `nodekey:demo${i}`, HostName: host, DNSName: `${dns}.tail-demo.ts.net.`, OS: os, UserID: 1000 + user,
    TailscaleIPs: [`100.101.0.${i + 2}`, `fd7a:115c:a1e0::${i + 2}`], Tags: tags,
    CurAddr: online && tun === 'd' ? `192.168.1.${20 + i}:41641` : '', Relay: tun === 'd' ? 'osl' : tun,
    RxBytes: online ? (i + 1) * 7_340_000 + Math.floor(now / 60_000) % 1000 * 1000 : 0, TxBytes: online ? (i + 1) * 2_110_000 + Math.floor(now / 60_000) % 1000 * 400 : 0,
    LastSeen: online ? NEVER : iso(now - ago * DAY), Online: online, ExitNode: exit, ExitNodeOption: exit, Active: online,
    ...(keyDays == null ? {} : { KeyExpiry: iso(now + keyDays * DAY) }),
  }];
  return {
    Version: '1.76.6-tdemo', BackendState: 'Running', MagicDNSSuffix: 'tail-demo.ts.net',
    CurrentTailnet: { Name: 'demo@example.com', MagicDNSSuffix: 'tail-demo.ts.net', MagicDNSEnabled: true },
    Self: { ID: 'nHOMELABCNTRL', PublicKey: 'nodekey:demoself', HostName: 'homelab', DNSName: 'homelab.tail-demo.ts.net.', OS: 'linux', UserID: 1001,
      TailscaleIPs: ['100.101.0.1', 'fd7a:115c:a1e0::1'], Tags: ['tag:server'], Online: true, KeyExpiry: iso(now + 200 * DAY) },
    Peer: Object.fromEntries(PEERS.map(peer)),
    User: { 1001: { ID: 1001, LoginName: 'sebastian@example.com', DisplayName: 'Sebastian' }, 1002: { ID: 1002, LoginName: 'ingrid@example.com', DisplayName: 'Ingrid' } },
  };
}
