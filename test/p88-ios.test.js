// Prompt 88 (IOS88): Media → NRK (søk, serieside, plakater på «Serier du følger») og Media → Musikk (yubal) i Homelab-appen (iOS).
// Fasit: server/nrkdl.js, server/yubal.js, public/js/media-nrk.js, public/js/media-musikk.js og pakke 58 (Media NRK/Musikk.dc.html).
// Ingen Swift-kompilator i sandkassen: kildesjekker (struktur, tekster, API-stier, trykkflater og reglene for handlinger).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'apps/ios/FinansHub/Sources');
const raw = (f) => readFileSync(join(SRC, f), 'utf8');
/** Uten linjekommentarer. */
const code = (f) => raw(f).split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('///')).join('\n');
const NEW = ['Nrk88Model.swift', 'Nrk88Views.swift', 'Musikk88Model.swift', 'Musikk88Views.swift'];

/** Liten Swift-lekser (som i p87-ios): nestede blokk-kommentarer, strenger med interpolasjon, så klammebalanse. */
function lex(src) {
  let out = ''; let i = 0; const n = src.length;
  function str() {
    while (i < n) {
      const c = src[i];
      if (c === '"') { i++; return ''; }
      if (c === '\n') return 'uavsluttet streng';
      if (c === '\\' && src[i + 1] === '(') {
        i += 2; let d = 1; out += '(';
        while (i < n && d > 0) {
          if (src[i] === '"') { i++; const e = str(); if (e) return e; continue; }
          if (src[i] === '(') d++; else if (src[i] === ')') d--;
          i++;
        }
        out += ')';
        continue;
      }
      i += c === '\\' ? 2 : 1;
    }
    return 'uavsluttet streng';
  }
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      let d = 1; i += 2;
      while (i < n && d > 0) {
        if (src[i] === '/' && src[i + 1] === '*') { d++; i += 2; } else if (src[i] === '*' && src[i + 1] === '/') { d--; i += 2; } else i++;
      }
      if (d > 0) return 'uavsluttet blokk-kommentar';
      continue;
    }
    if (c === '"') { i++; const e = str(); if (e) return e + ' ved linje ' + src.slice(0, i).split('\n').length; out += '""'; continue; }
    out += c; i++;
  }
  const st = []; const pair = { '}': '{', ')': '(', ']': '[' };
  let line = 1;
  for (const ch of out) {
    if (ch === '\n') line++;
    else if ('{(['.includes(ch)) st.push(ch);
    else if (ch in pair && st.pop() !== pair[ch]) return 'feil ' + ch + ' ved linje ' + line;
  }
  return st.length ? 'ulukket ' + st[st.length - 1] : '';
}

test('filene er hele, uten tvungen utpakking, og XcodeGen plukker dem opp (FinansHub/Sources)', () => {
  for (const f of [...NEW, 'Nrk87Model.swift', 'Nrk87Views.swift', 'Media43Model.swift', 'Media43Views.swift', 'Media45.swift']) {
    assert.equal(lex(raw(f)), '', f);
  }
  for (const f of NEW) {
    assert.doesNotMatch(code(f), /try!|as!|fatalError\(|\.first!|\.last!|\)!\s/, f);
    // Ingen «/api/media/…/*» i blokk-kommentarer (åpner en nestet kommentar i Swift).
    assert.doesNotMatch(raw(f), /\/\*[^\n]*\/\*/, f);
  }
  const yml = readFileSync(join(ROOT, 'apps/ios/project.yml'), 'utf8');
  assert.match(yml, /sources:\n\s+- FinansHub\/Sources\n/);
  assert.doesNotMatch(yml, /Nrk88|Musikk88/); // ingen nye targets
});

test('Musikk-fanen står etter NRK, med egen farge, visning og «dra for å oppdatere»', () => {
  assert.match(code('Media43Model.swift'), /\("nrk", "NRK"\), \("musikk", "Musikk"\), \("avspilling", "Avspilling"\)\]/);
  const v = code('Media43Views.swift');
  assert.match(v, /case "musikk": Musikk88View\(\)/);
  assert.match(v, /if m\.tab == "musikk" \{ await Musikk88\.shared\.load\(store, full: true\); return \}/);
  assert.match(code('Media45.swift'), /case "musikk": return Color\(hex: "#7a4fa0"\)/);
});

test('alle kall går via Homelab-serveren (Media46.call) – ingen adresser, token eller egne nettverkskall', () => {
  const nrk = code('Nrk88Model.swift');
  const mu = code('Musikk88Model.swift');
  assert.match(nrk, /try await Media46\.shared\.call\(store, method, "\/media\/nrk" \+ path, json: json, timeout: timeout\)/);
  assert.match(mu, /try await Media46\.shared\.call\(store, method, "\/media\/yubal" \+ path, json: json, timeout: timeout\)/);
  for (const f of NEW) {
    assert.doesNotMatch(code(f), /URLSession|URLRequest|:8010|:8020|10\.69\.|Bearer|nrk_token|yubal_url|NRK_DL|YUBAL_URL/, f);
  }
  for (const f of ['Nrk88Views.swift', 'Musikk88Views.swift']) assert.doesNotMatch(code(f), /Media46\.shared\.call/, f);
  // NRK: søk, serie, sesong, jobber med episoder, følg.
  for (const p of ['"/sok?q=" + Nrk88.enc(text)', '"/serie/" + sid', '"/serie/" + sid + "/sesong/" + name', '"POST", "/jobber"', '"POST", "/folger"', '"DELETE", "/folger/" + f.id']) {
    assert.ok(nrk.includes(p), p);
  }
  // Musikk: alle rutene fra server/yubal.js.
  for (const p of ['"/jobs"', '"/subscriptions"', '"/status"', '"/info?url=" + Musikk88.enc(u)', '"/jobs/" + j.id + "/cancel"', '"DELETE", "/jobs/" + j.id',
    '"DELETE", "/jobs")', '"PATCH", "/subscriptions/" + s.id', '"/subscriptions/" + s.id + "/sync"', '"/subscriptions/sync"',
    '"DELETE", "/subscriptions/" + s.id', '"/subscriptions/" + id + "/tracks"', '"/subscriptions/" + id + "/sync"']) {
    assert.ok(mu.includes(p), p);
  }
  // Id-er valideres før de settes inn i stien.
  assert.match(nrk, /"\^\[a-z0-9\]\[a-z0-9_-\]\{0,100\}\$"/);
  assert.match(nrk, /"\^\[A-Za-z0-9_-\]\{1,60\}\$"/);
  assert.match(nrk, /"\^\[A-Za-z\]\{4\}\[0-9\]\{8\}\$"/);
  assert.match(mu, /"\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}\$"/);
  assert.ok((mu.match(/Musikk88\.okId\(/g) || []).length >= 6);
  // Episodelenkene bygges fra PRF-id-en (som serveren), aldri fra fritekst.
  assert.match(nrk, /e\.url = "https:\/\/tv\.nrk\.no\/program\/" \+ id/);
});

test('bilder bare via serverens bildeproxy, med samme innlogging som andre Media-bilder', () => {
  assert.match(code('Nrk88Model.swift'), /return s\.hasPrefix\("\/api\/media\/nrk\/bilde\?"\) \? s : ""/);
  assert.match(code('Musikk88Model.swift'), /return s\.hasPrefix\("\/api\/media\/yubal\/bilde\?"\) \? s : ""/);
  // Følg-objektene får bilde og radio fra GET /jobber.
  const m87 = code('Nrk87Model.swift');
  assert.match(m87, /f\.image = Nrk88\.img\(JS\.str\(r, "bilde"\)\)/);
  assert.match(m87, /f\.radio = JS\.bool\(r, "radio"\) \?\? false/);
  for (const f of ['Nrk88Views.swift', 'Musikk88Views.swift']) assert.match(code(f), /Media50Remote\(url: url, want: 320\)/, f);
});

test('NRK: kort «NRK» med søk, kvalitet, komprimering, VPN, treff (16:9) og «Har du en lenke?»', () => {
  const v = code('Nrk88Views.swift');
  for (const t of ['NRK', 'Søk i NRK TV og NRK Radio', 'KVALITET', 'Komprimer (H.265, ca. halv størrelse)', 'Har du en lenke?',
    'Søk etter serier, filmer og podkaster.', 'Søker …', 'SERIE', 'FILM', 'RADIO', 'EPISODE', 'I KØ', 'IKKE TILGJENGELIG', 'Last ned',
    'Søket krever en nyere versjon av nrk-dl. Bruk lenkefeltet under.', 'VPN nede – stoppet', '‹ Søk']) {
    assert.ok(v.includes(`"${t}`) || v.includes(`${t}"`), t);
  }
  assert.match(v, /if m\.hasKomp \{ compress \}/);
  assert.match(v, /\.frame\(width: 128, height: 72\)/); // 16:9
  assert.match(v, /\.aspectRatio\(16\.0 \/ 9\.0, contentMode: \.fit\)/);
  assert.match(v, /if open \{ Nrk87Form\(\) \}/);
  // Kort 1 erstatter det gamle skjemaet øverst; Bibliotek er beholdt.
  const v87 = code('Nrk87Views.swift');
  assert.match(v87, /\} else \{\n\s+Nrk88Top\(\)\n\s+Nrk87Queue\(\)\n\s+Nrk87Follows\(\)\n\s+\}\n\s+Nrk87Library\(\)/);
  assert.doesNotMatch(v87, /"Last ned fra NRK"/);
  // Komprimering sendes bare når valget avviker fra serverens standard (som web).
  assert.equal((code('Nrk88Model.swift').match(/if nrk\.hasKomp && nrk\.komp != nrk\.kompStd \{ body\["komprimer"\] = nrk\.komp \}/g) || []).length, 3);
});

test('NRK: serieside med sesongvelger, avkrysning, merker og bunnlinje', () => {
  const v = code('Nrk88Views.swift');
  const m = code('Nrk88Model.swift');
  for (const t of ['Fjern valg', 'Velg alle tilgjengelige (', '✓ Følger serien', 'Følg serien', 'Legger i køen …', 'Last ned 1 episode',
    'Henter serien fra NRK …', 'Henter episodene …', 'Ingen episoder i denne sesongen.', 'Ingen episoder tilgjengelig hos NRK akkurat nå.',
    'Ikke tilgjengelig', 'Lastet ned', 'I kø', 'Prøv igjen']) {
    assert.ok(v.includes(`"${t}`) || v.includes(`${t}"`), t);
  }
  assert.match(v, /"Last ned \\\(chosen\) episoder"/);
  assert.match(m, /static let help: String = "Følg serien laster ned nye episoder fremover \(de to nyeste sesongene\), ikke hele arkivet\."/);
  // kan=false / lastetNed / iKo kan ikke velges.
  assert.match(m, /func canPick\(_ e: Nrk88Ep\) -> Bool \{ e\.can && !e\.done && !isQueued\(e\) \}/);
  assert.match(v, /\.disabled\(!ok\)/);
  // Tomme sesonger er dempet og kan ikke velges; valgt = den brukeren trykket på, ellers nyeste med episoder.
  assert.match(v, /\.opacity\(o\.available \? 1 : 0\.4\)\n\s+\.disabled\(!o\.available\)/);
  assert.match(m, /return x\.seasons\.last\(where: \{ \$0\.available \}\)/);
  // «Last ned N episoder» = én jobb med episodelenkene (høyst 200) og tittel «Serie · sesong».
  assert.match(m, /let chosen: \[Nrk88Ep\] = Array\(list\.filter \{ canPick\(\$0\) && pick\.contains\(\$0\.id\) \}\.prefix\(200\)\)/);
  assert.match(m, /"episoder": urls\]/);
  // En serie i Bibliotek åpner seriesiden (i Bibliotek-kortet, med «‹ Bibliotek»).
  const v87 = code('Nrk87Views.swift');
  assert.match(v87, /Nrk88\.shared\.open\(sid, title: it\.title, from: "lib", store\)/);
  assert.match(v87, /Nrk88SeriesPage\(back: "‹ Bibliotek"\)/);
});

test('NRK: «Serier du følger» med plakat 48×72 (radio 72×72) og reserveflate med tittel', () => {
  const v = code('Nrk87Views.swift');
  assert.match(v, /Nrk88Image\(url: f\.image, title: f\.title, font: 12, bottom: true\)\n\s+\.frame\(width: f\.radio \? 72 : 48, height: 72\)/);
  assert.match(v, /"Du følger ingen serier\. Åpne en serie og trykk «Følg serien»\."/);
});

test('ingen handling uten trykk: søk er lesing, delingsmottaket og «Lim inn» fyller bare feltet', () => {
  const nrk = code('Nrk88Model.swift');
  // Søket gjør bare GET.
  const sok = nrk.slice(nrk.indexOf('func search('), nrk.indexOf('nonisolated static func hits('));
  assert.doesNotMatch(sok, /"POST"|"DELETE"|"PATCH"/);
  const typed = nrk.slice(nrk.indexOf('func typed('), nrk.indexOf('func clear('));
  assert.doesNotMatch(typed, /download|"POST"/);
  // Nedlasting/følg bare fra knappene.
  const v = code('Nrk88Views.swift');
  assert.equal((v.match(/s\.download\(h, store\)/g) || []).length, 1);
  assert.equal((v.match(/s\.downloadPicked\(store\)/g) || []).length, 1);
  assert.equal((v.match(/s\.toggleFollow\(store\)/g) || []).length, 1);
  // Lenker utenfra: prefill åpner bare «Har du en lenke?».
  const m87 = code('Nrk87Model.swift');
  const pre = m87.slice(m87.indexOf('func prefill('), m87.indexOf('func paste('));
  assert.match(pre, /Nrk88\.shared\.showLink\(\)/);
  const show = nrk.slice(nrk.indexOf('func showLink('), nrk.indexOf('/* ---------- Søk ---------- */', nrk.indexOf('func showLink(')));
  assert.doesNotMatch(show, /call\(|Task|download/);
  // Musikk: homelab://media/musikk?url=… og «Lim inn» fyller bare ut.
  const mu = code('Musikk88Model.swift');
  const mpre = mu.slice(mu.indexOf('func prefill('), mu.indexOf('func edited('));
  assert.match(mpre, /guard let s = UIPasteboard\.general\.string, !s\.isEmpty else/);
  assert.doesNotMatch(mpre, /call\(|Task|start\(|preview\(/);
  const h = code('Media43Model.swift');
  const body = h.slice(h.indexOf('func handleURL('), h.indexOf('/* ---------- Nettverk ---------- */'));
  assert.match(body, /if !ml\.isEmpty \{ Musikk88\.shared\.prefill\(ml\) \}/);
  assert.doesNotMatch(body, /Musikk88\.shared\.(start|preview|sync|act|toggle|unfollow|clean)\(/);
  for (const f of ['App.swift', 'AppWidgets.swift', 'Media43Model.swift']) {
    assert.doesNotMatch(code(f), /Musikk88\.shared\.(start|sync|act|toggle|unfollow|clean)\(|Nrk88\.shared\.(download|downloadPicked|toggleFollow)\(/, f);
  }
  const mv = code('Musikk88Views.swift');
  assert.equal((mv.match(/m\.start\(store\)/g) || []).length, 1);
  assert.match(mv, /Button \{ m\.paste\(\) \} label: \{\n\s+Text\("Lim inn"\)/);
});

test('Musikk: lenker bare fra YouTube Music/YouTube, max_items 1–10000, følg bare spillelister', () => {
  const mu = code('Musikk88Model.swift');
  assert.match(mu, /let re: String = "\^https:\/\/\(music\\\\\.youtube\\\\\.com\|youtube\\\\\.com\|www\\\\\.youtube\\\\\.com\|m\\\\\.youtube\\\\\.com\|youtu\\\\\.be\)\/"/);
  assert.match(mu, /static let bareYt: String = "Bare lenker fra music\.youtube\.com, youtube\.com eller youtu\.be\."/);
  assert.match(mu, /maxN = Swift\.max\(1, Swift\.min\(10000, v\)\)/);
  assert.match(mu, /let max: Int\? = p\.kind != "track" && typ == "max" \? Swift\.max\(1, Swift\.min\(10000, maxN\)\) : nil/);
  assert.match(mu, /let subscribe: Bool = p\.kind == "playlist" && follow/);
  const re = /^https:\/\/(music\.youtube\.com|youtube\.com|www\.youtube\.com|m\.youtube\.com|youtu\.be)\//i;
  for (const ok of ['https://music.youtube.com/playlist?list=PL1', 'https://youtu.be/abc', 'https://www.youtube.com/watch?v=x']) assert.ok(re.test(ok), ok);
  for (const bad of ['http://music.youtube.com/x', 'https://music.youtube.com.evil.com/x', 'https://evil.com/?u=https://youtu.be/x', 'javascript:alert(1)']) assert.ok(!re.test(bad), bad);
});

test('Musikk: tekstene fra designet, tomtilstand og sangene i en spilleliste', () => {
  const v = code('Musikk88Views.swift');
  const m = code('Musikk88Model.swift');
  for (const t of ['Musikk er ikke satt opp', 'Åpne Integrasjoner', 'Last ned musikk', 'Album, spilleliste eller sang fra music.youtube.com', 'Lim inn',
    'Forhåndsvis', 'Henter …', 'Alle spor', 'Bare de første', 'spor', 'Følg spillelisten (nye sanger lastes ned automatisk)', 'Følg og last ned',
    'Lagres som ', ' i musikkbiblioteket (Navidrome)', 'Køen', 'Fjern ferdige', 'Ingenting i køen.', 'Automatisk', 'Manuell', 'Avbryt', 'Fjern',
    'Spillelister du følger', 'Synk alle', 'Synker …', 'Synk nå', 'Slutt å følge', 'Du følger ingen spillelister.', 'Henter sangene …',
    'Sanglista er ikke tilgjengelig fra yubal', 'Fikk ikke kontakt med yubal']) {
    assert.ok(v.includes(`"${t}`) || v.includes(`${t}"`), t);
  }
  for (const t of ['VENTER', 'HENTER INFO', 'LASTER NED', 'IMPORTERER', 'FERDIG', 'FEILET', 'AVBRUTT', 'ALBUM', 'SPILLELISTE', 'SANG',
    'LASTET NED', 'FINNES ALT', 'IKKE SYNKET', ' lastet ned', ' feilet', ' hoppet over', 'Kilde: ', ' kbps', 'Neste automatiske sjekk: ',
    'Automatisk synk er slått av i yubal', 'Ikke synket ennå', 'Synket ', 'de første ', 'i dag ', 'i morgen ', ' fantes fra før', ' ikke synket']) {
    assert.ok(m.includes(t), t);
  }
  assert.match(v, /\} else if !m\.configured \{\n\s+notSet/);
  assert.match(v, /store\.paperGo\("innst-integ"\)/);
  // Én spilleliste åpen om gangen; sangene hentes når lista åpnes og huskes i 60 s.
  assert.match(m, /if open == s\.id \{ open = nil; return \}\n\s+open = s\.id\n\s+if let t = tracks\[s\.id\], Date\(\)\.timeIntervalSince\(t\.at\) < 60 \{ return \}/);
  assert.match(v, /if open \{ Mu88TrackList\(id: s\.id\) \}/);
  // Køen: Avbryt mens den går, Fjern når den er ferdig.
  assert.match(v, /if j\.done \{\n\s+Nrk87Small\(text: "Fjern"[^\n]*\n\s+\} else \{\n\s+Nrk87Small\(text: "Avbryt"/);
});

test('oppdatering: 2 s mens noe pågår, ellers 10 s, stopper når fanen ikke vises og hoppes over i bakgrunnen', () => {
  const m = code('Musikk88Model.swift');
  assert.match(m, /while !Task\.isCancelled \{\n\s+let wait: UInt64 = active \? 2_000_000_000 : 10_000_000_000\n\s+try\? await Task\.sleep\(nanoseconds: wait\)\n\s+if Task\.isCancelled \{ break \}/);
  assert.match(m, /if UIApplication\.shared\.applicationState != \.active \{ continue \}/);
  assert.match(m, /var active: Bool \{ jobs\.contains \{ !\$0\.done \} \}/);
  const v = code('Musikk88Views.swift');
  assert.match(v, /\.task \{ await m\.run\(store\) \}/);
  for (const f of NEW) assert.doesNotMatch(code(f), /Timer\.|DispatchQueue\.main\.asyncAfter/, f);
  // NRK-søket venter 350 ms etter siste tastetrykk; seriesiden friskes opp når en jobb blir ferdig.
  assert.match(code('Nrk88Model.swift'), /try\? await Task\.sleep\(nanoseconds: 350_000_000\)/);
  assert.match(code('Nrk88Views.swift'), /if now < old \{ Task \{ await s\.refreshQuiet\(store\) \} \}/);
});

test('tilgjengelighet: 44 pt trykkflater, VoiceOver-etiketter og Dynamic Type (ingen faste systemfonter for tekst)', () => {
  const v = code('Nrk88Views.swift');
  const mv = code('Musikk88Views.swift');
  assert.match(v, /\.frame\(width: 44, height: 44\)/); // «Tøm søk»
  assert.match(v, /\.accessibilityLabel\("Tøm søk"\)/);
  assert.match(v, /\.accessibilityLabel\("Søk i NRK"\)/);
  assert.match(v, /\.frame\(minHeight: 48\)/); // episoderad
  assert.match(v, /\.accessibilityAddTraits\(traits\)/);
  assert.match(mv, /\.accessibilityLabel\("Lenke fra YouTube Music"\)/);
  assert.match(mv, /\.accessibilityLabel\("Antall spor"\)/);
  assert.match(mv, /\.accessibilityLabel\(s\.enabled \? "Automatisk synk er på" : "Automatisk synk er av"\)/);
  assert.match(mv, /\.accessibilityLabel\("Fremdrift"\)/);
  for (const s of [v, mv]) {
    assert.ok((s.match(/minHeight: 4[4-9]|minHeight: 5\d|height: 46/g) || []).length >= 3);
    // Tekst bruker PF (egendefinerte fonter skaleres med Dynamic Type); .system bare for ikoner.
    assert.doesNotMatch(s, /Text\([^\n]*\)\.font\(\.system/);
  }
});
