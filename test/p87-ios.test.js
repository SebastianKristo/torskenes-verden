// Prompt 87 (NRKIOS): Media → NRK i Homelab-appen (iOS). Fasit: prompt-54-pakke/claude-code-media-nrk-nedlaster.md.
// Ingen Swift-kompilator i sandkassen: kildesjekker (struktur, tekster, API-stier og reglene rundt lenker utenfra).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps/ios/FinansHub/Sources');
const raw = (f) => readFileSync(join(SRC, f), 'utf8');
/** Uten linjekommentarer. */
const code = (f) => raw(f).split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('///')).join('\n');

/** Liten Swift-lekser: nestede blokk-kommentarer (en «/*» inni en kommentar åpner en ny!), strenger med interpolasjon,
 *  og så klammebalanse. Returnerer feilteksten, eller '' når alt går opp. */
function lex(src) {
  let out = ''; let i = 0; const n = src.length;
  function str() { // i står rett etter åpnende "
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

test('NRK-fanen finnes i Media, mellom Prowlarr og Avspilling, og fanelinja ruller valgt fane inn i midten', () => {
  const model = code('Media43Model.swift');
  // Prompt 88: «Musikk» (yubal) står mellom NRK og Avspilling (test/p88-ios.test.js).
  assert.match(model, /\("prowlarr", "Prowlarr"\), \("nrk", "NRK"\), \("musikk", "Musikk"\), \("avspilling", "Avspilling"\)\]/);
  const views = code('Media43Views.swift');
  assert.match(views, /case "nrk": Nrk87View\(wide: wide\)/);
  assert.match(views, /ScrollViewReader \{ \(proxy: ScrollViewProxy\) in/);
  assert.match(views, /\.id\(t\.0\)/);
  assert.match(views, /\.onAppear \{ proxy\.scrollTo\(m\.tab, anchor: \.center\) \}/);
  assert.match(views, /proxy\.scrollTo\(now, anchor: \.center\)/);
  // Dra for å oppdatere henter NRK-dataene når NRK-fanen vises.
  assert.match(views, /if m\.tab == "nrk" \{ await Nrk87\.shared\.load\(store, full: true\) \} else \{ await m\.loadAll\(store\) \}/);
  assert.match(code('Media45.swift'), /case "nrk": return Color\(hex: "#2b5d8a"\)/);
});

test('filene er hele (kommentarer, strenger og klammer går opp)', () => {
  assert.equal(lex('/* a /api/x/*, b */ let a = 1'), 'uavsluttet blokk-kommentar');
  assert.equal(lex('let s = "a \\(f("x")) {" + "https://x" // (\n'), '');
  for (const f of ['Nrk87Model.swift', 'Nrk87Views.swift', 'Media43Views.swift', 'Media43Model.swift', 'Media45.swift']) {
    assert.equal(lex(raw(f)), '', f);
  }
  // Ingen tvungen utpakking i de nye filene.
  for (const f of ['Nrk87Model.swift', 'Nrk87Views.swift']) {
    const c = code(f);
    assert.doesNotMatch(c, /try!|as!|fatalError\(|\.first!|\.last!|\)!\s/, f);
  }
});

test('alle kall går via Homelab-serveren (/api/media/nrk/*) – aldri rett mot nrk-dl, og ingen token i appen', () => {
  const m = code('Nrk87Model.swift');
  assert.match(m, /try await Media46\.shared\.call\(store, method, "\/media\/nrk" \+ path, json: json, timeout: timeout\)/);
  // Eneste nettverksvei i modellen er call(…); ingen egne URLSession-kall og ingen adresser til nrk-dl.
  assert.doesNotMatch(m, /URLSession|URLRequest|:8020|10\.69\.|Bearer|nrk_token|NRK_DL/);
  assert.doesNotMatch(code('Nrk87Views.swift'), /URLSession|URLRequest|:8020|10\.69\.|Bearer|nrk_token|NRK_DL|Media46\.shared\.call/);
  for (const p of ['"/jobber"', '"/status"', '"/bibliotek"', '"/serie?url=" + q', '"/rydd"', '"/folger/" + f.id + "/sjekk"', '"/folger/" + f.id', '"/jobber/" + j.id']) {
    assert.ok(m.includes(p), p);
  }
  assert.match(m, /"\/jobber\/" \+ j\.id \+ "\/" \+ \(what == "avbryt" \? "avbryt" : "igjen"\)/);
  // id-er fra serveren settes bare inn i stien når de er 12 hex-tegn.
  assert.match(m, /id\.range\(of: "\^\[a-f0-9\]\{12\}\$", options: \.regularExpression\) != nil/);
  assert.equal((m.match(/guard Nrk87\.okId\(/g) || []).length, 3);
  // Bilder bare via serverens proxy (sti på Homelab), aldri rett mot NRK fra appen.
  assert.match(m, /it\.image = img\.hasPrefix\("\/"\) \? img : ""/);
});

test('lenker: bare nrk.no / nrksuper.no (https), 409 = ligger allerede i køen, komprimer bare når valget er endret', () => {
  const m = code('Nrk87Model.swift');
  assert.match(m, /let re: String = "\^https:\/\/\(\[a-z0-9-\]\+\\\\\.\)\*\(nrk\\\\\.no\|nrksuper\\\\\.no\)\(\/\|\$\)"/);
  assert.match(m, /formErr = "Bare lenker fra nrk\.no og nrksuper\.no\."/);
  assert.match(m, /catch let e as APIError where e\.status == 409 \{\n\s+self\.formErr = "Lenken ligger allerede i køen\."/);
  assert.match(m, /var body: \[String: Any\] = \["url": u, "type": type, "kvalitet": qual, "folg": follow\]\n\s+if hasKomp && komp != kompStd \{ body\["komprimer"\] = komp \}/);
  // Episoder fra biblioteket: bare gyldige NRK-lenker, maks 200, og én episode blir aldri til «hele serien».
  assert.match(m, /let urls: \[String\] = Array\(eps\.map \{ \$0\.url \}\.filter \{ Nrk87\.valid\(\$0\) \}\.prefix\(200\)\)/);
  assert.match(m, /if !whole && urls\.count != eps\.count \{ libErr = "Mangler NRK-lenken til episoden\."; return \}/);
  assert.match(m, /if !urls\.isEmpty \{ body\["episoder"\] = urls \}/);
  // Regexen selv (samme som i Swift) oppfører seg riktig.
  const re = /^https:\/\/([a-z0-9-]+\.)*(nrk\.no|nrksuper\.no)(\/|$)/i;
  for (const ok of ['https://tv.nrk.no/serie/exit', 'https://radio.nrk.no/podkast/abels_taarn', 'https://nrk.no', 'https://www.nrksuper.no/serie/x']) assert.ok(re.test(ok), ok);
  for (const bad of ['http://tv.nrk.no/serie/exit', 'https://nrk.no.evil.com/x', 'https://evilnrk.no/', 'https://tv.nrk.no@evil.com/', 'javascript:alert(1)', 'https://evil.com/?u=https://tv.nrk.no/']) assert.ok(!re.test(bad), bad);
});

test('«Lim inn» og lenker utenfra fyller bare ut feltet – ingen nedlasting uten «Last ned» (regelen fra prompt 86)', () => {
  const m = code('Nrk87Model.swift');
  const pre = m.slice(m.indexOf('func prefill('), m.indexOf('private func call('));
  assert.match(pre, /url = String\(l\.prefix\(2000\)\)/);
  assert.match(pre, /guard let s = UIPasteboard\.general\.string, !s\.isEmpty else/);
  assert.doesNotMatch(pre, /add\(|call\(|"POST"|"DELETE"|Task \{/);
  // Dyplenken homelab://media/nrk?url=… (eksisterende mottak i Media43.handleURL) kaller bare prefill.
  const h = code('Media43Model.swift');
  const body = h.slice(h.indexOf('func handleURL('), h.indexOf('/* ---------- Nettverk ---------- */'));
  assert.match(body, /if t == "nrk" \{[\s\S]*?if !link\.isEmpty \{ Nrk87\.shared\.prefill\(link\) \}\n\s+\}\n\s+show\(t\)/);
  assert.doesNotMatch(body, /Nrk87\.shared\.add|"POST"|\.queue\(/);
  // add(…) kalles bare fra knappen og tastaturets «Gå» i skjemaet.
  const v = code('Nrk87Views.swift');
  assert.equal((v.match(/m\.add\(store\)/g) || []).length, 2);
  assert.match(v, /Button \{ m\.paste\(\) \} label: \{\n\s+Text\("Lim inn"\)/);
  for (const f of ['App.swift', 'AppWidgets.swift', 'Media43Model.swift']) assert.doesNotMatch(code(f), /Nrk87\.shared\.(add|queue|act|clean|check|unfollow)\(/, f);
  // Ny konto = ingenting fra forrige konto.
  assert.match(m, /let acct: String = store\.account\?\.id \?\? ""\n\s+if acct == scope \{ return \}/);
});

test('oppdatering: 2 s med noe i kø, ellers 10 s, og stopper når fanen ikke vises', () => {
  const m = code('Nrk87Model.swift');
  assert.match(m, /while !Task\.isCancelled \{\n\s+let wait: UInt64 = active \? 2_000_000_000 : 10_000_000_000\n\s+try\? await Task\.sleep\(nanoseconds: wait\)\n\s+if Task\.isCancelled \{ break \}/);
  assert.match(m, /if UIApplication\.shared\.applicationState != \.active \{ continue \}/);
  assert.match(m, /var active: Bool \{ jobs\.contains \{ \$0\.active \} \}/);
  // Løkka eies av visningens .task (avbrytes av SwiftUI når fanen byttes) – ingen løs Task eller Timer.
  const v = code('Nrk87Views.swift');
  assert.match(v, /\.task \{ await m\.run\(store\) \}/);
  assert.doesNotMatch(m + v, /Timer\.|DispatchQueue\.main\.asyncAfter/);
  // Skjemaet lever i modellen, så feltet ikke mister teksten når Media tegnes på nytt.
  assert.match(v, /TextField\("https:\/\/tv\.nrk\.no\/serie\/…", text: Binding<String>\(get: \{ m\.url \}, set: \{ \(v: String\) in m\.url = v; m\.formErr = "" \}\)\)/);
});

test('tåler at felt mangler: uten komprimer ingen avkrysningsboks, uten bibliotek «krever en nyere versjon av nrk-dl»', () => {
  const m = code('Nrk87Model.swift');
  assert.match(m, /if let k = JS\.dict\(o, "komprimer"\) \{[\s\S]*?if !kompTouched \{ komp = kompStd \}\n\s+\} else \{\n\s+hasKomp = false/);
  assert.match(m, /if JS\.bool\(o, "bibliotek"\) == false \{\n\s+libState = "gammel"/);
  assert.match(m, /if JS\.bool\(o, "tilgjengelig"\) == false \{\n\s+libState = "gammel"/);
  assert.match(m, /catch let e as APIError where e\.status == 404 \|\| e\.status == 405 \{[\s\S]*?libState = "gammel"/);
  assert.match(m, /if libState == "gammel" \{ return \}/);
  // Prompt 88: kvalitet, komprimering og VPN-merket står øverst i kort 1 «NRK» (Nrk88Views.swift).
  const v = code('Nrk87Views.swift') + code('Nrk88Views.swift');
  assert.match(v, /if m\.hasKomp \{ compress \}/);
  assert.match(v, /if m\.libState == "gammel" \{[\s\S]*?Text\("Biblioteket krever en nyere versjon av nrk-dl\."\)/);
  assert.match(v, /if m\.hasVpn \{/);
  assert.match(v, /\} else if !m\.configured \{\n\s+notSet/);
});

test('tekstene og knappene fra designet', () => {
  // Prompt 88: kort 1 heter «NRK» (søk, kvalitet, komprimering, VPN) i Nrk88Views.swift; lenkeskjemaet under «Har du en lenke?».
  const v = code('Nrk87Views.swift') + code('Nrk88Views.swift');
  const m = code('Nrk87Model.swift');
  for (const t of [
    'Har du en lenke?', 'Lim inn', 'Last ned', 'TYPE', 'KVALITET', 'Følg serien', 'Laster ned nye episoder automatisk',
    'Komprimer (H.265, ca. halv størrelse)', 'På som standard på serveren', 'Av som standard på serveren',
    'VPN nede – stoppet', 'Køen', 'Fjern ferdige', 'Venter på VPN: tunnelen er ikke i Norge. Køen står stille.',
    'Ingenting i køen. Lim inn en lenke fra tv.nrk.no eller radio.nrk.no.', 'VENTER', 'Venter på VPN …',
    'Avbryt', 'Prøv igjen', 'Se etter nye', 'Fjern', 'Serier du følger', 'Sjekk nå', 'Sjekker …', 'Slutt å følge',
    'Du følger ingen serier. Åpne en serie og trykk «Følg serien».',
    'NRK-nedlasteren er ikke satt opp', 'Åpne Integrasjoner', 'Bibliotek', '‹ Bibliotek', 'Åpne på NRK', 'Last ned på nytt',
    '/Serie/Season 01/Serie - S01E02 - Tittel.mkv', '/Tittel/Tittel.mkv', '/Serie/2026-11-13 - Tittel.m4a', 'H.265 · crf ',
  ]) assert.ok(v.includes(`"${t}`) || v.includes(`${t}"`), t);
  for (const t of ['Finn ut selv', 'Serie', 'Film', 'Radio', 'Beste', '1080p', '720p', '540p', 'Alle', 'Serier', 'Filmer',
    'LASTET NED', 'LASTER NED', 'I KØ', 'MANGLER', 'FERDIG', 'FEIL', 'AVBRUTT', ' med komprimering', 'Sjekket ']) assert.ok(m.includes(t), t);
  assert.match(v, /missing > 0 \? "Last ned \\\(missing\) som mangler" : "Se etter nye"/);
  assert.match(v, /store\.paperGo\("innst-integ"\)/);
  // Knapper etter status: kø/kjører → Avbryt; feil/avbrutt → Prøv igjen + Fjern; ferdig serie/radio → Se etter nye + Fjern; ferdig film → Fjern.
  assert.match(v, /if j\.active \{ Nrk87Small\(text: "Avbryt", color: p\.lab\)/);
  assert.match(v, /if done && j\.type != "film" \{ Nrk87Small\(text: "Se etter nye"/);
  assert.match(v, /if retry \|\| done \{ Nrk87Small\(text: "Fjern"/);
  assert.match(v, /if m\.hasDone \{ Nrk87Small\(text: "Fjern ferdige"/);
  // Under komprimering: «H.265 · crf N» i stedet for fart. Ferdig med spart > 0: grønn linje.
  assert.match(m, /var compressing: Bool \{ status == "kjorer" && msg\.hasPrefix\("Komprimerer"\) \}/);
  assert.match(v, /if j\.compressing \{\n\s+parts\.append\(m\.kompCrf\.isEmpty \? "H\.265" : "H\.265 · crf " \+ m\.kompCrf\)\n\s+\} else if j\.speed > 0 \{/);
  assert.match(v, /if j\.status == "ferdig" && j\.saved > 0 \{\n\s+Text\(Nrk87\.savedText\(j\.saved\)\)[^\n]*foregroundStyle\(p\.pos\)/);
  // Rekkefølge på telefon: Last ned → Køen → Serier du følger → Bibliotek.
  assert.match(v, /\} else \{\n\s+Nrk88Top\(\)\n\s+Nrk87Queue\(\)\n\s+Nrk87Follows\(\)\n\s+\}\n\s+Nrk87Library\(\)/);
  // Plakat-rutenett 2:3 med minst 150 pt per plakat.
  assert.match(v, /GridItem\(\.adaptive\(minimum: 150\)/);
  assert.match(v, /\.aspectRatio\(2\.0 \/ 3\.0, contentMode: \.fit\)/);
  // Lenker som åpnes i nettleseren er alltid validerte NRK-lenker.
  assert.equal((v.match(/openURL\(u\)/g) || []).length, 2);
  assert.equal((v.match(/if Nrk87\.valid\((j|it)\.url\), let u = URL\(string: (j|it)\.url\)/g) || []).length, 2);
});

test('ingen ny Share Extension og ingen nye URL-skjemaer (bare det eksisterende mottaket brukes)', () => {
  const yml = readFileSync(join(SRC, '..', '..', 'project.yml'), 'utf8');
  assert.doesNotMatch(yml, /share-services|com\.apple\.share/);
  assert.match(yml, /CFBundleURLSchemes: \[finanshub, homelab, papir\]/);
});
