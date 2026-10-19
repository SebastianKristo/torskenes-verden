// Falsk NAS for MOCK_DATA=1 og tester: etterligner smbclient (samme utdata som smbclient 4.x) mot et filsystem i minnet.
//   nas.local / 192.168.1.20 / nas   shares backup (skrivbar), media (bare lesing), home (skrivbar), skjulte admin$/IPC$/print$
//   192.168.1.30 / gammel-nas.local  som over, men bare SMB2 (feiler når laveste versjon er SMB3)
// Passordet «feil» gir NT_STATUS_LOGON_FAILURE. Gjest (tomt brukernavn) får liste shares og lese media.
// Brukes via _setSmbExec() i server/finans/backup.js. Mappenavnene her er bare testdata.
import { readFileSync, statSync, writeFileSync } from 'node:fs';

const D = () => ({ d: {}, f: {} });
const tree = (o) => { const n = D(); for (const [k, v] of Object.entries(o)) n.d[k] = tree(v); return n; };
function fresh() {
  return {
    backup: { comment: 'Sikkerhetskopier', ro: false, guest: false, root: tree({ homelab: {}, 'Time Machine': {}, finanshub: {}, 'Bilder fra mobil': { 2025: {}, 2026: {} } }) },
    media: { comment: 'Filmer, musikk og bilder', ro: true, guest: true, root: tree({ Filmer: {}, Musikk: {}, Bilder: { 2024: {}, 2025: {} } }) },
    home: { comment: 'Hjemmemapper', ro: false, guest: false, root: tree({ sebastian: { Dokumenter: {}, Nedlastinger: {} } }) },
    // Prompt 34: share som etterligner feilen «backup-mappen vises ikke»: «backup» er et ZFS-datasett/junction (attributt «Dr»,
    // som den gamle parseren forkastet), «Privat» gir ACCESS_DENIED, «Backup på NAS» er lagret i NFD (macOS), pluss systemmapper.
    arkiv: { comment: 'Arkiv', host: 'tn', ro: false, guest: false, root: tree({ backup: { homelab: {} }, Privat: { hemmelig: {} }, ['Backup p\u0061\u030a NAS'.normalize('NFD')]: {}, '@eaDir': {}, '#recycle': {}, '.skjult': {}, Dokumenter: {} }),
      attrs: { backup: 'Dr', '#recycle': 'DH', '.skjult': 'DH' }, deny: ['Privat'] },
    'backup$': { comment: '', host: 'tn', ro: false, guest: false, hidden: true, root: tree({ homelab: {} }) },
  };
}
let SHARES = fresh();
/** Bare for tester: start med et nytt filsystem. */
export const resetMockSmb = () => { SHARES = fresh(); };
export const mockSmbTree = () => SHARES;
// truenas.local / 192.168.1.40 (prompt 34): sharene arkiv og den skjulte backup$.
const HOSTS = { 'nas.local': 'nas', nas: 'nas', '192.168.1.20': 'nas', '192.168.1.30': 'old', 'gammel-nas.local': 'old', 'truenas.local': 'tn', '192.168.1.40': 'tn' };
export const MOCK_NAS = { host: 'nas.local', ip: '192.168.1.20', name: 'NAS' };

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = (n) => String(n).padStart(2, '0');
const stamp = (t) => { const d = new Date(t); return `${DAYS[d.getDay()]} ${MON[d.getMonth()]} ${String(d.getDate()).padStart(2, ' ')} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())} ${d.getFullYear()}`; };
const T0 = Date.parse('2026-10-01T10:00:00');
const line = (name, attr, size, t) => `  ${name.padEnd(35)}${attr.padStart(2)} ${String(size).padStart(8)}  ${stamp(t)}`;

function tokens(cmd) {
  const out = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m;
  while ((m = re.exec(cmd))) out.push(m[1] ?? m[2]);
  return out;
}
const parts = (p) => String(p ?? '').replace(/\\/g, '/').split('/').filter((x) => x && x !== '.');

/** Samme form som den ekte exec-en: (args, {timeout}) → {code, stdout, stderr} */
export async function mockSmbExec(args) {
  if (process.env.NODE_ENV !== 'test') await new Promise((r) => setTimeout(r, 180));
  if (args[0] === '--version') return { code: 0, stdout: 'Version 4.19.5-falsk-NAS (MOCK_DATA)\n', stderr: '' };
  const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const fail = (msg) => ({ code: 1, stdout: '', stderr: msg + '\n' });
  let user = 'guest', pass = '';
  const af = opt('-A');
  if (af) {
    const t = readFileSync(af, 'utf8');
    user = (t.match(/^username = (.*)$/m)?.[1] ?? 'guest').trim();
    pass = t.match(/^password = (.*)$/m)?.[1] ?? '';
  }
  const guest = !user || user === 'guest';
  const min = (args.find((a) => a.startsWith('--option=client min protocol=')) ?? '').split('=').pop();
  const listHost = opt('-L');
  const target = listHost ?? args[0];
  const m = String(target).match(/^\/\/([^/]+)(?:\/([^/]+))?/);
  const kind = m ? HOSTS[m[1].toLowerCase()] : null;
  if (!kind) return fail(`do_connect: Connection to ${m?.[1] ?? target} failed (Error NT_STATUS_HOST_UNREACHABLE)`);
  if (kind === 'old' && /^SMB3/.test(min)) return fail('protocol negotiation failed: NT_STATUS_CONNECTION_RESET');
  if (pass === 'feil') return fail('session setup failed: NT_STATUS_LOGON_FAILURE');
  if (listHost) {
    const rows = Object.entries(SHARES).filter(([, s]) => !s.hidden && (s.host ?? 'nas') === (kind === 'tn' ? 'tn' : 'nas')).map(([n, s]) => `Disk|${n}|${s.comment}`);
    return { code: 0, stdout: [...rows, 'Disk|admin$|Fjernadministrasjon', 'IPC|IPC$|IPC Service (NAS)', 'Disk|print$|Printer Drivers', ''].join('\n'), stderr: 'SMB1 disabled -- no workgroup available\n' };
  }
  const sh = SHARES[m[2]];
  if (!sh || (sh.host ?? 'nas') !== (kind === 'tn' ? 'tn' : 'nas')) return fail('tree connect failed: NT_STATUS_BAD_NETWORK_NAME');
  if (guest && !sh.guest) return fail('tree connect failed: NT_STATUS_ACCESS_DENIED');
  let cwd = [];
  const nodeAt = (p) => { let n = sh.root; for (const x of p) { n = n.d[x]; if (!n) return null; } return n; };
  const dir = (args.find((a) => a.startsWith('--directory=')) ?? '').slice('--directory='.length) || null;
  if (dir) {
    const p = parts(dir);
    if (p.includes('..') || !nodeAt(p)) return fail(`cd \\${p.join('\\')}\\: NT_STATUS_OBJECT_NAME_NOT_FOUND`);
    cwd = p;
  }
  const out = [];
  let code = 0;
  for (const raw of String(opt('-c') ?? '').split(';')) {
    const [cmd, a1, a2] = tokens(raw.trim());
    if (!cmd) continue;
    const here = nodeAt(cwd);
    code = 0;
    const err = (s) => { out.push(s); code = 1; };
    if ((cmd === 'ls' || cmd === 'dir') && a1 && /[\\/]\*$/.test(a1)) {
      // ls "mappe/*" (tilgangssjekk): ACCESS_DENIED for mapper i deny-listen.
      const sub = parts(a1.replace(/[\\/]\*$/, ''));
      const node = nodeAt([...cwd, ...sub]);
      if (!node) { err(`NT_STATUS_OBJECT_NAME_NOT_FOUND listing \\${[...cwd, ...sub].join('\\')}\\*`); continue; }
      if ((sh.deny ?? []).includes(sub.at(-1)) && !cwd.length) { err(`NT_STATUS_ACCESS_DENIED listing \\${[...cwd, ...sub].join('\\')}\\*`); continue; }
      out.push(line('.', 'D', 0, T0), line('..', 'D', 0, T0));
      for (const [n] of Object.entries(node.d).sort()) out.push(line(n, 'D', 0, T0));
    } else if (cmd === 'ls' || cmd === 'dir') {
      out.push(line('.', 'D', 0, T0), line('..', 'D', 0, T0));
      for (const [n] of Object.entries(here.d).sort()) out.push(line(n, (!cwd.length && sh.attrs?.[n]) || 'D', 0, T0));
      for (const [n, f] of Object.entries(here.f).sort()) out.push(line(n, 'A', f.size, f.mtime));
      out.push('', '\t\t3906469376 blocks of size 1024. 2512048128 blocks available');
    } else if (cmd === 'cd') {
      const p = a1 === '..' ? cwd.slice(0, -1) : [...cwd, ...parts(a1)];
      if (!nodeAt(p)) err(`cd \\${p.join('\\')}\\: NT_STATUS_OBJECT_NAME_NOT_FOUND`); else cwd = p;
    } else if (cmd === 'mkdir') {
      if (sh.ro || guest) err(`NT_STATUS_ACCESS_DENIED making remote directory \\${[...cwd, a1].join('\\')}`);
      else if (here.d[a1] || here.f[a1]) err(`NT_STATUS_OBJECT_NAME_COLLISION making remote directory \\${[...cwd, a1].join('\\')}`);
      else here.d[a1] = D();
    } else if (cmd === 'put') {
      if (sh.ro || guest) { err(`NT_STATUS_ACCESS_DENIED opening remote file \\${[...cwd, a2].join('\\')}`); continue; }
      const st = statSync(a1);
      here.f[a2] = { size: st.size, mtime: Date.now(), data: st.size < 64 * 1024 * 1024 ? readFileSync(a1) : null };
      out.push(`putting file ${a1} as \\${[...cwd, a2].join('\\')} (${Math.round(st.size / 1024)} kb/s) (average ${Math.round(st.size / 1024)} kb/s)`);
    } else if (cmd === 'get') {
      const f = here.f[a1];
      if (!f) { err(`NT_STATUS_OBJECT_NAME_NOT_FOUND opening remote file \\${[...cwd, a1].join('\\')}`); continue; }
      writeFileSync(a2, f.data ?? Buffer.alloc(0));
    } else if (cmd === 'rename') {
      if (sh.ro || guest) err(`NT_STATUS_ACCESS_DENIED renaming files \\${[...cwd, a1].join('\\')} -> \\${[...cwd, a2].join('\\')}`);
      else if (!here.f[a1]) err(`NT_STATUS_OBJECT_NAME_NOT_FOUND renaming files \\${[...cwd, a1].join('\\')}`);
      else { here.f[a2] = here.f[a1]; delete here.f[a1]; }
    } else if (cmd === 'pwd') {
      out.push(`Current directory is \\\\nas\\${m[2]}\\${cwd.join('\\')}`);
    } else if (cmd === 'del' || cmd === 'rm') {
      if (sh.ro || guest) err(`NT_STATUS_ACCESS_DENIED deleting remote file \\${[...cwd, a1].join('\\')}`);
      else if (!here.f[a1]) err(`NT_STATUS_NO_SUCH_FILE listing \\${[...cwd, a1].join('\\')}`);
      else delete here.f[a1];
    } else err(`${cmd}: command not found`);
  }
  return { code, stdout: out.join('\n') + '\n', stderr: '' };
}
