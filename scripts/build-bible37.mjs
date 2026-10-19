// Bygger server/data/bible1930-morgen.json og -kveld.json fra Bibelen 1930 (Det Norske Bibelselskap, fri tekst).
// Kilde: scrollmapper/bible_databases formats/json/Norsk.json («Norsk: Bibelen på Norsk (1930)»).
// Bruk: node build.mjs <Norsk.json> <ut-mappe>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [, , src, outDir] = process.argv;
const J = JSON.parse(readFileSync(src, 'utf8'));
const BOOK = {
  Genesis: ['1 Mosebok', '1 Mos'], Exodus: ['2 Mosebok', '2 Mos'], Numbers: ['4 Mosebok', '4 Mos'], Deuteronomy: ['5 Mosebok', '5 Mos'],
  Joshua: ['Josva', 'Jos'], Ruth: ['Rut', 'Rut'], 'I Samuel': ['1 Samuel', '1 Sam'], 'I Chronicles': ['1 Krønikebok', '1 Krøn'], Nehemiah: ['Nehemja', 'Neh'], Job: ['Job', 'Job'],
  Psalms: ['Salme', 'Sal'], Proverbs: ['Ordspråkene', 'Ordsp'], Ecclesiastes: ['Forkynneren', 'Fork'], Isaiah: ['Jesaja', 'Jes'], Jeremiah: ['Jeremia', 'Jer'],
  Lamentations: ['Klagesangene', 'Klag'], Hosea: ['Hosea', 'Hos'], Micah: ['Mika', 'Mika'], Habakkuk: ['Habakkuk', 'Hab'], Zephaniah: ['Sefanja', 'Sef'], Nahum: ['Nahum', 'Nah'],
  Matthew: ['Matteus', 'Matt'], Mark: ['Markus', 'Mark'], Luke: ['Lukas', 'Luk'], John: ['Johannes', 'Joh'], Acts: ['Apostlenes gjerninger', 'Apg'],
  Romans: ['Romerne', 'Rom'], 'I Corinthians': ['1 Korinter', '1 Kor'], 'II Corinthians': ['2 Korinter', '2 Kor'], Galatians: ['Galaterne', 'Gal'], Ephesians: ['Efeserne', 'Ef'],
  Philippians: ['Filipperne', 'Fil'], Colossians: ['Kolosserne', 'Kol'], 'I Thessalonians': ['1 Tessaloniker', '1 Tess'], 'II Thessalonians': ['2 Tessaloniker', '2 Tess'],
  'I Timothy': ['1 Timoteus', '1 Tim'], 'II Timothy': ['2 Timoteus', '2 Tim'], Titus: ['Titus', 'Tit'], Hebrews: ['Hebreerne', 'Hebr'], James: ['Jakob', 'Jak'],
  'I Peter': ['1 Peter', '1 Pet'], 'II Peter': ['2 Peter', '2 Pet'], 'I John': ['1 Johannes', '1 Joh'], 'Revelation of John': ['Johannes’ åpenbaring', 'Åp'], Jude: ['Judas', 'Jud'], Ezekiel: ['Esekiel', 'Esek'], Zechariah: ['Sakarja', 'Sak'], Philemon: ['Filemon', 'Filem'],
};
const books = new Map(J.books.map((b) => [b.name, b]));
// Kilden følger KJV-inndelingen: i salmer der overskriften er eget vers (norsk/hebraisk nummerering), er de siste norske
// versene slått sammen i kildens siste vers. Disse deles igjen ved starten av det norske verset (teksten er uendret),
// og salmer med sammenslåtte vers som ikke deles, får ikke brukt siste vers.
const SHIFTED = new Set([3,4,5,6,7,8,9,12,13,18,19,20,21,22,30,31,34,36,38,39,40,41,42,44,45,46,47,48,49,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,67,68,69,70,75,76,77,80,81,83,84,85,88,89,92,102,108,140,142]);
const SPLIT = { 3: ['Herren hører frelsen til'], 4: ['I fred vil jeg'], 5: ['For du velsigner'], 19: ['La min munns ord'], 30: ['Herre min Gud!'], 31: ['Vær ved godt mot'],
  34: ['Herren forløser'], 36: ['Der faller de'], 40: ['For jeg er elendig'], 42: ['Hvorfor er du nedbøiet'], 46: ['Herren, hærskarenes Gud, er med oss'], 51: ['Gjør vel imot Sion', 'Da skal du ha behag'],
  55: ['Og du, Gud, skal støte'], 57: ['Vis dig høi'], 59: ['Min styrke!'], 61: ['Så vil jeg lovsynge'], 62: ['Og dig, Herre'], 63: ['Og kongen skal'], 65: ['Engene er klædd'],
  77: ['Du førte ditt folk'], 84: ['Herre, hærskarenes Gud, salig'], 88: ['Du har drevet'], 92: ['for å kunngjøre'], 108: ['Ved Gud skal vi'], 18: ['Han gjør frelsen stor'] };
const chapterVerses = new Map();
function versesOf(book, ch) {
  const k = `${book} ${ch}`;
  if (chapterVerses.has(k)) return chapterVerses.get(k);
  const vs = (books.get(book)?.chapters.find((c) => c.chapter === ch)?.verses ?? []).map((x) => ({ verse: x.verse, text: x.text }));
  if (book === 'Psalms' && SHIFTED.has(ch) && vs.length) {
    const last = vs.pop();
    const phrases = SPLIT[ch];
    if (phrases) {
      let rest = last.text, v = last.verse; const parts = [];
      for (const ph of phrases) { const i = rest.indexOf(' ' + ph); if (i < 0) throw new Error(`Fant ikke «${ph}» i Sal ${ch}`); parts.push(rest.slice(0, i).trim()); rest = rest.slice(i + 1); }
      parts.push(rest.trim());
      parts.forEach((t, i) => vs.push({ verse: v + i, text: t }));
    } // ellers: det sammenslåtte siste verset brukes ikke
  }
  chapterVerses.set(k, vs);
  return vs;
}
const verse = (book, ch, v) => versesOf(book, ch).find((x) => x.verse === v)?.text;
const clean = (t) => String(t).replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();

// [bok, kapittel, fra, til] – alle vers i området, ett vers per dag. [bok, kap, v, v2, 'par'] = to vers sammen.
const MORNING = [
  ['Lamentations', 3, 22, 23, 'par'], ['Lamentations', 3, 24, 26],
  ['Psalms', 118, 24, 24], ['Philippians', 4, 13, 13], ['Isaiah', 41, 10, 13], ['Psalms', 5, 2, 4], ['Psalms', 5, 12, 13],
  ['Psalms', 19, 2, 15], ['Psalms', 27, 1, 14], ['Psalms', 30, 5, 6], ['Psalms', 30, 12, 13], ['Psalms', 33, 1, 22], ['Psalms', 34, 2, 11],
  ['Psalms', 46, 2, 8], ['Psalms', 57, 8, 12], ['Psalms', 59, 17, 18], ['Psalms', 63, 2, 9], ['Psalms', 65, 10, 14], ['Psalms', 84, 2, 13], ['Psalms', 90, 12, 17],
  ['Psalms', 92, 2, 6], ['Psalms', 95, 1, 7], ['Psalms', 96, 1, 13], ['Psalms', 98, 1, 9], ['Psalms', 100, 1, 5], ['Psalms', 103, 1, 22], ['Psalms', 104, 24, 35],
  ['Psalms', 108, 2, 6], ['Psalms', 111, 1, 10], ['Psalms', 113, 1, 9], ['Psalms', 117, 1, 2], ['Psalms', 118, 1, 23], ['Psalms', 118, 25, 29],
  ['Psalms', 143, 8, 10], ['Psalms', 145, 1, 21], ['Psalms', 146, 1, 10], ['Psalms', 147, 1, 11], ['Psalms', 148, 1, 13], ['Psalms', 150, 1, 6],
  ['Isaiah', 12, 2, 6], ['Isaiah', 40, 28, 31], ['Isaiah', 43, 1, 7], ['Isaiah', 43, 18, 19], ['Isaiah', 55, 6, 12], ['Isaiah', 60, 1, 3], ['Isaiah', 61, 1, 3],
  ['Joshua', 1, 9, 9], ['Nehemiah', 8, 10, 10], ['Zephaniah', 3, 17, 17], ['Micah', 6, 8, 8], ['Habakkuk', 3, 17, 19], ['Jeremiah', 29, 11, 13], ['Jeremiah', 17, 7, 8],
  ['Proverbs', 3, 1, 12], ['Proverbs', 16, 3, 3], ['Proverbs', 16, 9, 9], ['Proverbs', 4, 18, 18], ['Proverbs', 4, 23, 23],
  ['Philippians', 1, 3, 11], ['Philippians', 2, 13, 15], ['Philippians', 3, 13, 14], ['Philippians', 4, 4, 5], ['Philippians', 4, 8, 9], ['Philippians', 4, 19, 19],
  ['Romans', 8, 28, 39], ['Romans', 12, 1, 21], ['Romans', 15, 13, 13], ['Ephesians', 3, 14, 21], ['Ephesians', 2, 8, 10], ['Ephesians', 6, 10, 11],
  ['Colossians', 3, 12, 17], ['Colossians', 3, 23, 24], ['II Corinthians', 4, 16, 18], ['II Corinthians', 5, 17, 17], ['II Corinthians', 12, 9, 10], ['II Corinthians', 9, 8, 8],
  ['Galatians', 5, 22, 23, 'par'], ['Galatians', 6, 9, 9], ['James', 1, 2, 8], ['James', 1, 17, 17], ['Hebrews', 12, 1, 2], ['Hebrews', 10, 23, 23], ['Hebrews', 11, 1, 1],
  ['I Corinthians', 13, 4, 13], ['I Corinthians', 15, 57, 58], ['I Corinthians', 16, 13, 14], ['Matthew', 5, 3, 16], ['Matthew', 7, 7, 8], ['John', 15, 1, 17], ['John', 8, 12, 12],
  ['I John', 4, 7, 19], ['II Timothy', 1, 7, 7], ['I Thessalonians', 5, 16, 18], ['Titus', 2, 11, 11], ['I Peter', 1, 3, 3], ['Psalms', 37, 23, 24], ['Psalms', 16, 11, 11],
  ['Isaiah', 26, 9, 9], ['Psalms', 88, 14, 14], ['Psalms', 119, 105, 112], ['Psalms', 119, 147, 148], ['Psalms', 139, 9, 10],
  ['Psalms', 66, 1, 8], ['Psalms', 89, 16, 17], ['Psalms', 105, 1, 4], ['Psalms', 107, 1, 9], ['Psalms', 138, 1, 3], ['Psalms', 149, 1, 5], ['Isaiah', 40, 8, 8],
  ['Isaiah', 42, 10, 12], ['Isaiah', 52, 7, 7], ['Isaiah', 58, 8, 8], ['Jeremiah', 32, 17, 17], ['Habakkuk', 2, 14, 14], ['Mark', 10, 27, 27], ['Mark', 11, 22, 24],
  ['Luke', 1, 37, 37], ['Luke', 1, 46, 55], ['John', 1, 1, 5], ['John', 1, 14, 16], ['John', 4, 14, 14], ['John', 10, 10, 10], ['John', 13, 34, 35], ['Acts', 17, 28, 28],
  ['Romans', 1, 16, 16], ['Romans', 5, 8, 8], ['Romans', 6, 4, 4], ['Romans', 13, 8, 10], ['I Corinthians', 2, 9, 9], ['I Corinthians', 9, 24, 24], ['I Corinthians', 10, 31, 31],
  ['II Corinthians', 3, 17, 18], ['Galatians', 5, 1, 1], ['Galatians', 5, 13, 14], ['Ephesians', 4, 1, 7], ['Ephesians', 4, 22, 24], ['Ephesians', 5, 1, 2], ['Ephesians', 5, 8, 10],
  ['Ephesians', 5, 19, 20], ['Philippians', 2, 1, 11], ['Colossians', 1, 9, 10], ['I Thessalonians', 5, 11, 11], ['I Thessalonians', 5, 14, 15], ['II Thessalonians', 2, 16, 17],
  ['I Timothy', 4, 12, 12], ['I Timothy', 6, 6, 8], ['II Timothy', 2, 1, 1], ['II Timothy', 3, 16, 17], ['Titus', 3, 4, 5], ['Hebrews', 13, 1, 2], ['Hebrews', 13, 8, 8],
  ['Hebrews', 13, 15, 16], ['James', 1, 19, 22], ['James', 3, 17, 18], ['I Peter', 2, 9, 9], ['I Peter', 4, 8, 10], ['II Peter', 3, 18, 18], ['I John', 3, 18, 18],
  ['I John', 5, 4, 4], ['Revelation of John', 1, 8, 8], ['Psalms', 1, 1, 3], ['Psalms', 8, 2, 10], ['Psalms', 9, 2, 3], ['Psalms', 18, 29, 37], ['Psalms', 18, 2, 4],
  ['Psalms', 20, 2, 6], ['Psalms', 24, 1, 10], ['Psalms', 29, 1, 11], ['Psalms', 40, 6, 6], ['Psalms', 47, 2, 9], ['Psalms', 67, 2, 7], ['Psalms', 71, 14, 19], ['Psalms', 86, 9, 10],
  ['Psalms', 89, 2, 3], ['Psalms', 97, 1, 12], ['Psalms', 99, 1, 5], ['Psalms', 106, 1, 3], ['Psalms', 112, 1, 4], ['Psalms', 115, 1, 1], ['Psalms', 119, 1, 16],
];
const EVENING = [
  ['Psalms', 4, 9, 9], ['Matthew', 11, 28, 30], ['I Peter', 5, 7, 7], ['John', 14, 27, 27], ['Psalms', 4, 2, 8],
  ['Psalms', 3, 4, 7], ['Psalms', 16, 1, 10], ['Psalms', 23, 1, 6], ['Psalms', 31, 2, 6], ['Psalms', 31, 15, 25], ['Psalms', 32, 1, 11], ['Psalms', 37, 1, 11],
  ['Psalms', 42, 2, 12], ['Psalms', 51, 3, 14], ['Psalms', 62, 2, 9], ['Psalms', 91, 1, 16], ['Psalms', 116, 1, 9], ['Psalms', 121, 1, 8], ['Psalms', 127, 1, 2],
  ['Psalms', 131, 1, 3], ['Psalms', 134, 1, 3], ['Psalms', 139, 1, 8], ['Psalms', 139, 11, 18], ['Psalms', 139, 23, 24], ['Psalms', 141, 2, 3], ['Psalms', 74, 16, 16],
  ['Psalms', 63, 7, 8], ['Psalms', 55, 23, 23], ['Psalms', 46, 9, 12], ['Psalms', 34, 12, 23], ['Psalms', 36, 6, 10], ['Psalms', 40, 2, 4], ['Psalms', 86, 1, 7],
  ['Psalms', 86, 11, 13], ['Psalms', 94, 18, 19], ['Psalms', 130, 1, 8], ['Psalms', 138, 7, 8], ['Psalms', 145, 18, 18], ['Psalms', 147, 3, 3], ['Psalms', 18, 2, 3],
  ['Psalms', 25, 1, 10], ['Psalms', 28, 6, 7], ['Psalms', 61, 2, 5], ['Psalms', 73, 23, 26], ['Psalms', 77, 2, 3], ['Psalms', 103, 8, 14],
  ['Matthew', 6, 25, 34], ['John', 14, 1, 3], ['John', 16, 33, 33], ['John', 10, 11, 15], ['John', 10, 27, 29], ['I Peter', 5, 6, 6], ['I Peter', 5, 8, 11],
  ['Philippians', 4, 6, 7], ['Isaiah', 26, 3, 4], ['Isaiah', 30, 15, 15], ['Isaiah', 40, 1, 11], ['Isaiah', 53, 4, 6], ['Isaiah', 54, 10, 10], ['Isaiah', 46, 4, 4],
  ['Isaiah', 43, 25, 25], ['Isaiah', 1, 18, 18], ['Isaiah', 32, 17, 18], ['Exodus', 33, 14, 14], ['Numbers', 6, 24, 26], ['Deuteronomy', 33, 27, 27], ['Deuteronomy', 31, 8, 8],
  ['Micah', 7, 18, 19], ['Nahum', 1, 7, 7], ['Luke', 2, 29, 32], ['Luke', 24, 29, 29], ['Luke', 12, 22, 32], ['Romans', 5, 1, 5], ['Romans', 8, 1, 1], ['Romans', 8, 26, 27],
  ['Hebrews', 4, 9, 16], ['Hebrews', 13, 5, 6], ['Hebrews', 13, 20, 21], ['II Thessalonians', 3, 16, 16], ['Colossians', 3, 15, 15], ['I John', 1, 5, 9], ['I John', 3, 1, 3],
  ['II Corinthians', 1, 3, 4], ['Revelation of John', 21, 3, 5], ['Revelation of John', 3, 20, 20], ['Mark', 6, 31, 31], ['Mark', 4, 37, 41], ['Proverbs', 3, 24, 26],
  ['Ecclesiastes', 3, 1, 8], ['Job', 11, 18, 19], ['Hosea', 6, 1, 3], ['Ephesians', 4, 26, 26], ['Ephesians', 4, 31, 32], ['Psalms', 119, 49, 50], ['Psalms', 119, 165, 165],
  ['Psalms', 119, 76, 77], ['Psalms', 119, 114, 114], ['Psalms', 119, 55, 55], ['Psalms', 119, 62, 62],
  ['Psalms', 13, 6, 6], ['Psalms', 17, 8, 8], ['Psalms', 17, 15, 15], ['Psalms', 33, 20, 22], ['Psalms', 37, 25, 40], ['Psalms', 39, 8, 8], ['Psalms', 56, 4, 5], ['Psalms', 56, 9, 9],
  ['Psalms', 57, 2, 2], ['Psalms', 71, 1, 8], ['Psalms', 71, 20, 21], ['Psalms', 85, 9, 14], ['Psalms', 90, 1, 2], ['Psalms', 107, 28, 31], ['Psalms', 112, 7, 7],
  ['Psalms', 115, 9, 15], ['Psalms', 119, 169, 176], ['Psalms', 125, 1, 2], ['Psalms', 126, 3, 6], ['Psalms', 128, 1, 2], ['Psalms', 133, 1, 1], ['Psalms', 136, 1, 9],
  ['Psalms', 136, 23, 26], ['Psalms', 144, 1, 2], ['Psalms', 145, 13, 21], ['Isaiah', 33, 2, 2], ['Isaiah', 35, 3, 10], ['Isaiah', 40, 26, 27], ['Isaiah', 42, 3, 3],
  ['Isaiah', 49, 13, 16], ['Isaiah', 57, 15, 15], ['Isaiah', 58, 11, 11], ['Isaiah', 66, 13, 13], ['Jeremiah', 31, 3, 3], ['Jeremiah', 31, 25, 25], ['Jeremiah', 33, 3, 3],
  ['Lamentations', 3, 31, 33], ['Lamentations', 3, 55, 58], ['Matthew', 18, 20, 20], ['Matthew', 28, 20, 20], ['John', 3, 16, 17], ['John', 6, 35, 37], ['John', 11, 25, 26],
  ['Romans', 8, 14, 18], ['Romans', 14, 7, 8], ['Romans', 15, 4, 6], ['I Corinthians', 10, 13, 13], ['II Corinthians', 4, 6, 9], ['II Corinthians', 13, 11, 11],
  ['Galatians', 2, 20, 20], ['Ephesians', 1, 3, 8], ['Philippians', 1, 6, 6], ['Colossians', 1, 11, 14], ['Colossians', 2, 6, 7], ['I Thessalonians', 5, 9, 10],
  ['I Thessalonians', 5, 23, 24], ['II Timothy', 2, 13, 13], ['Hebrews', 2, 18, 18], ['Hebrews', 6, 19, 19], ['James', 4, 8, 8], ['James', 5, 13, 16], ['I Peter', 2, 24, 25],
  ['I Peter', 3, 8, 12], ['I John', 5, 14, 15], ['Jude', 1, 24, 25], ['Revelation of John', 7, 16, 17], ['Genesis', 28, 15, 15], ['Exodus', 14, 14, 14],
  ['Deuteronomy', 33, 12, 12], ['I Chronicles', 16, 34, 34], ['Job', 19, 25, 25], ['Proverbs', 18, 10, 10], ['Proverbs', 15, 1, 1], ['Ecclesiastes', 4, 9, 10],
  ['Psalms', 6, 3, 5], ['Psalms', 10, 14, 14], ['Psalms', 10, 17, 17], ['Psalms', 22, 5, 6], ['Psalms', 26, 3, 3], ['Psalms', 31, 8, 8], ['Psalms', 38, 10, 10],
  ['Psalms', 41, 2, 4], ['Psalms', 43, 3, 5], ['Psalms', 44, 2, 4], ['Psalms', 48, 10, 15], ['Psalms', 50, 15, 15], ['Psalms', 54, 6, 6], ['Psalms', 60, 13, 13],
  ['Psalms', 68, 20, 21], ['Psalms', 69, 14, 17], ['Psalms', 70, 5, 5], ['Psalms', 72, 12, 14], ['Psalms', 80, 4, 4], ['Psalms', 102, 2, 3], ['Psalms', 102, 26, 29],
  ['Psalms', 120, 1, 1], ['Psalms', 123, 1, 2], ['Psalms', 124, 7, 8], ['Psalms', 142, 6, 6], ['Psalms', 143, 1, 1], ['Psalms', 143, 5, 6], ['Psalms', 146, 7, 9],
  ['Isaiah', 25, 1, 1], ['Isaiah', 25, 4, 4], ['Isaiah', 44, 22, 22], ['Isaiah', 48, 17, 18], ['Isaiah', 51, 11, 12], ['Isaiah', 62, 3, 5], ['Isaiah', 63, 7, 7],
  ['Ezekiel', 34, 11, 16], ['Ezekiel', 36, 26, 26], ['Luke', 15, 4, 7], ['Luke', 15, 20, 24], ['Luke', 10, 41, 42], ['John', 15, 9, 13],
  ['John', 20, 19, 21], ['Acts', 3, 19, 20], ['Romans', 10, 9, 13], ['I John', 4, 16, 18], ['I Corinthians', 1, 9, 9], ['Philemon', 1, 7, 7], ['Revelation of John', 22, 20, 21],
];

function collect(list, seen) {
  const out = [];
  for (const [book, ch, a, b, mode] of list) {
    const [name, short] = BOOK[book] ?? (() => { throw new Error('Mangler boknavn: ' + book); })();
    const one = (v1, v2) => {
      const key = `${book} ${ch}:${v1}`;
      if (seen.has(key)) return;
      const parts = [];
      for (let v = v1; v <= v2; v++) { const t = verse(book, ch, v); if (!t) { if (book === 'Psalms') return; throw new Error(`Mangler ${book} ${ch}:${v}`); } parts.push(clean(t)); seen.add(`${book} ${ch}:${v}`); }
      const text = parts.join(' ');
      // Overskrifter («Til sangmesteren …») og svært lange vers passer ikke som dagens vers.
      if (/^(Til sangmesteren|En salme av|En sang|En læresalme|Av David|En bønn)/.test(text) && text.length < 80) return;
      if (text.length < 20 || text.length > 330) return;
      // Dagens vers skal kunne stå alene: ikke vers om fiender og dom, og ikke vers som begynner midt i en setning
      // (unntatt kjente vers som 1 Pet 5,7 «og kast all eders sorg på ham!»).
      const KEEP = new Set(['I Peter 5:7', 'Psalms 23:1', 'Psalms 121:1', 'Philippians 4:7', 'Philippians 4:13', 'John 14:27', 'Isaiah 41:10']);
      if (!KEEP.has(`${book} ${ch}:${v1}`)) {
        if (/^[a-zæøå]/.test(text)) return;
        if (/ugudelig|fiende|sverd|drep|forderv|hevn|vrede|skamme|ødelegg|utrydd|avindsm|blodgjerrig|onde menn|løgner|spott|håner|hånet|knus|forbann|straff|fall(er)? de|helvede|dødens|graven|dyr(ene)? i skogen|ild|de dør|de forferdes|muldyr|nyrer|omstøter|Sett ikke eders lit|refser/i.test(text)) return;
        if (/[,;:]$/.test(text)) return;
      }
      const range = v2 > v1 ? `${v1}–${v2}` : `${v1}`;
      const before = [], after = [];
      for (let v = v1 - 2; v < v1; v++) { const t = verse(book, ch, v); if (t && v >= 1) before.push({ v, text: clean(t) }); }
      for (let v = v2 + 1; v <= v2 + 2; v++) { const t = verse(book, ch, v); if (t) after.push({ v, text: clean(t) }); }
      out.push({ ref: `${name} ${ch},${range}`, short: `${short} ${ch},${range}`, book: name, chapter: ch, verse: v1, verseEnd: v2, text, before, after });
    };
    if (mode === 'par') one(a, b); else for (let v = a; v <= b; v++) one(v, v);
  }
  return out;
}
const seen = new Set();
const eve = collect(EVENING, seen); // kvelden først, så morgenlisten ikke tar kveldsversene (Fil 4,6–7 m.fl.)
const mor = collect(MORNING, seen);
// Stabil blanding (samme rekkefølge hver gang), så dagene ikke går gjennom én salme vers for vers.
function shuffle(arr, seed) {
  const a = arr.slice(0, Math.min(5, arr.length)); // de første (fasitens eksempler) beholdes øverst
  const rest = arr.slice(a.length);
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  return [...a, ...rest];
}
const meta = { translation: '1930', name: 'Bibelen (1930-oversettelsen)', publisher: 'Det Norske Bibelselskap', license: 'Fri bruk (falt i det fri)', source: 'scrollmapper/bible_databases · Norsk.json' };
const write = (file, period, list) => writeFileSync(join(outDir, file), JSON.stringify({ ...meta, period, count: list.length, verses: list.map((x, i) => ({ id: `${period[0]}${i + 1}`, ...x })) }, null, 0) + '\n');
write('bible1930-morgen.json', 'morgen', shuffle(mor, 1930));
write('bible1930-kveld.json', 'kveld', shuffle(eve, 2011));
console.log('morgen', mor.length, 'kveld', eve.length);
