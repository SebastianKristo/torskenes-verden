// =====================================================================
// Skjold Lab – 3D-printet sortering rundt hovedskapet (Raaco)
// =====================================================================
// Parametrisk OpenSCAD-modell som fyller hylla rundt hovedskapet
// (Raaco 150-01-typen, 12 rader x 5 kolonner, ca. 300 x 150 x 552 mm).
//
// Tolkning (2026-11-09): Raaco-skapet står nederst i en hylle på
// 560 mm bredde x 760 mm høyde x 320 mm dybde (målt, prompt 78; før:
// 570 x 700 x 300), med fronten fremst.
// Ledig plass som fylles:
//   (a) SIDETÅRN ved siden av Raaco: (hylle_bredde – raaco_bredde) ≈ 260 mm
//       bred, full høyde. Nederst 12 rader små skuffer på linje med
//       Raaco-radene (fronten i flukt med Raaco-fronten), over dem en
//       seksjon med STORE skuffer opp til hyllekanten.
//   (b) TOPPHYLLE over Raaco: raaco_bredde x (hylle_hoyde – raaco_hoyde)
//       ≈ 300 x 208 mm, med store skuffer.
//   (c) BAKKASSER (valgfritt) i de ca. 150 mm bak Raaco.
//   (d) LØSE KASSER S/M/L (åpen front, stablebare) for større ting.
//
// Skuffer og rammer er begrenset i dybde av printeren: rammene printes
// liggende på ryggen, så rammedybden er maks byggehoyde – 10 mm
// (dybde_maks). Resten av hylledybden blir ledig bak (echo viser hvor mye).
//
// VIKTIG: Standardmålene er TYPISKE mål. Mål hylla, Raaco-skapet og én
// skuff (se målekladden i README.md) før du printer noe stort.
//
// Koordinater: X = bredde (venstre -> høyre), Y = dybde (front y=0 -> bak),
// Z = høyde (hyllegulv -> topp). Rad 1 er øverst, skuff 1 er til venstre –
// samme nummerering som i Skjold Lab.
//
// Velg del med «del» (Customizer eller -D på kommandolinjen), f.eks.:
//   openscad -o skuff.stl -D 'del="skuff"' skjoldlab_tilleggsskap.scad
//   openscad -o modul_0_1.stl -D 'del="modul"' -D modul_x=0 -D modul_y=1 skjoldlab_tilleggsskap.scad
//   openscad -o oversikt.png -D 'del="oversikt"' skjoldlab_tilleggsskap.scad
// Alle printdeler legges ut ferdig orientert for print (ingen support).
//
// Alternativ med LED over hver skuff: skjoldlab_ledvegg.scad (samme hylle,
// skuffavstand låst til LED-avstanden, egen LED-skinne for Raaco).
// =====================================================================

/* [Del som skal lages] */
// Hvilken del som vises/eksporteres
del = "samlet"; // [samlet, oversikt, modul, skuff, skuffplate, skillevegg, skilleplate, lask, lask4, pinne, tarn_stor_modul, skuff_tarn_stor, skillevegg_tarn_stor, topp_modul, skuff_topp, skillevegg_topp, skuff_stor, skillevegg_stor, kasse_s, kasse_m, kasse_l, kasse_l_1, kasse_l_2, bakkasse]
// Rammemodul: kolonne av moduler (0 = venstre) – gjelder modul, tarn_stor_modul og topp_modul
modul_x = 0;
// Rammemodul: etasje av moduler (0 = nederst) – gjelder bare «modul»
modul_y = 0;
// I «samlet»/«oversikt»: vis skuffene
vis_skuffer = true;

/* [Målekladd – hylla og Raaco (se README)] */
// Hyllas innvendige bredde (mm)
hylle_bredde = 560;
// Hyllas innvendige høyde, fra hyllegulv til underkant av hylla over (mm)
hylle_hoyde = 760;
// Hyllas innvendige dybde (mm)
hylle_dybde = 320;
// Raaco-skapets bredde, utvendig (mm)
raaco_bredde = 300;
// Raaco-skapets høyde, utvendig (mm)
raaco_hoyde = 552;
// Raaco-skapets dybde, utvendig uten håndtak (mm)
raaco_dybde = 150;
// Hvilken side av hylla Raaco står inntil
raaco_side = "venstre"; // [venstre, hoyre]
// Luft mot hyllekanter og mellom seksjonene (mm)
klaring = 3;

/* [Målekladd – Raaco-radene] */
// Radavstand = (overkant skuff rad 1 – overkant skuff rad 12) / 11 (mm)
rad_avstand = 44;
// Skuffhøyde, utvendig, uten håndtak (mm)
skuff_hoyde = 37;
// Fra underkant skap til underkant nederste skuff (mm)
nederste_skuff_z = 14;
// Antall rader (som hovedskapet)
rader = 12;

/* [Overstyring av sidetårnet (0 = regn ut fra hylla)] */
// Sidetårnets bredde (0 = hylle_bredde – raaco_bredde – 2 x klaring)
skap_bredde = 0;
// Sidetårnets små-skuff-del, høyde (0 = raaco_hoyde)
skap_hoyde = 0;
// Rammedybde (0 = min(hylle_dybde – klaring, dybde_maks))
skap_dybde = 0;
// Maks ramme-/skuffdybde (0 = byggehoyde – 10, fordi rammene printes liggende på ryggen)
dybde_maks = 0;

/* [Små skuffer] */
// Ønsket skuffbredde – antall kolonner regnes ut fra bredden (mm)
skuff_bredde_onsket = 60;
// Tving antall kolonner (0 = regn ut automatisk)
kolonner_tvunget = 0;
// Tving skuffdybde (0 = regn ut fra rammedybden)
skuff_dybde_tvunget = 0;
// Skuffens sidevegger og bakvegg (mm)
skuff_vegg = 1.2;
// Skuffens front (tykkere pga. etikettfelt) (mm)
skuff_front = 2.0;
// Skuffens bunn (mm)
skuff_bunn = 1.2;
// Håndtak: hvor langt det stikker ut (mm)
grep_ut = 6;
// Håndtak: tykkelse ved roten (mm)
grep_tykk = 2.5;
// Etikettfelt: høyde (mm)
etikett_h = 10;
// Etikettfelt: dybde på forsenkningen (mm)
etikett_dybde = 0.6;
// Spor for skillevegger, som andel av innvendig dybde (1/3, 1/2, 2/3 gir 1–3 rom)
spor_posisjoner = [1/3, 1/2, 2/3];
// Skilleveggens tykkelse (mm)
skillevegg_t = 1.2;

/* [Store skuffer] */
// Lag store skuffer øverst i sidetårnet
lag_tarn_store = true;
// Lag topphylle med store skuffer over Raaco
lag_topphylle = true;
// Ønsket høyde på store skuffer – antall rader regnes ut (mm)
stor_hoyde_onsket = 60;
// Ønsket bredde på store skuffer – antall kolonner regnes ut (mm)
stor_bredde_onsket = 120;
// Sidetårn store: tving rader (0 = auto)
tarn_store_rader = 0;
// Sidetårn store: tving kolonner (0 = auto, rundes opp til hele moduler)
tarn_store_kolonner = 0;
// Topphylle: rader
topp_rader = 2;
// Topphylle: tving kolonner (0 = auto, rundes opp til hele moduler)
topp_kolonner = 0;
// Topphylle: bredde (0 = raaco_bredde – klaring)
topp_bredde = 0;
// Topphylle: dybde (0 = min(hylle_dybde – klaring, dybde_maks))
topp_dybde = 0;
// Luft over store skuffer (mm)
stor_luft = 3;
// Store skuffer: vegger (mm)
stor_vegg = 1.6;
// Store skuffer: bunn (mm)
stor_bunn = 1.6;
// Store skuffer: front (mm)
stor_front = 2.4;
// Store skuffer: maks håndtaksbredde (mm)
stor_grep_maks = 60;
// del="skuff_stor": egne mål (0 = som topphylla)
skuff_stor_bredde = 0;
skuff_stor_hoyde = 0;
skuff_stor_dybde = 0;

/* [Løse kasser] */
// Kasse S: [bredde, dybde (0 = auto), høyde] (mm) – 3 i bredden over Raaco, 2 stablet = 136 mm
kasse_s = [98, 0, 70];
// Kasse M: [bredde, dybde (0 = auto), høyde] (mm) – 2 i bredden over Raaco
kasse_m = [147, 0, 100];
// Kasse L: [bredde, dybde (0 = auto), høyde] (mm) – deles i 2 printdeler hvis bredere enn byggeplaten
kasse_l = [296, 0, 120];
// Antall kasser [S, M, L] (oversikt, deleliste og Skjold Lab)
kasse_antall = [3, 2, 1];
// Lag bakkasser bak Raaco (hvis hylla er dyp nok)
lag_bakkasser = true;
// Bakkasse: [bredde (0 = halve Raaco-bredden), dybde (0 = plassen bak Raaco minus grep), høyde] (mm)
bakkasse = [0, 0, 110];
// Kassevegger og bunn (mm)
kasse_vegg = 1.6;
kasse_bunn = 1.6;
// Stablefot: høyde (mm)
kasse_fot_h = 4;
// Frontens høyde som andel av kassehøyden
kasse_front_andel = 0.4;
// Skrå sidekant: andel av dybden
kasse_skra = 0.35;
// Grepsleppe: hvor langt den stikker ut (mm)
kasse_grep_ut = 5;
// Skjøtflens for todelte kasser: bredde inn fra veggen og tykkelse (mm)
kasse_flens_b = 8;
kasse_flens_t = 3;

/* [Ramme] */
// Sidevegger i rammen (mm)
veggtykkelse = 2.4;
// Bakvegg (mm)
bakvegg = 2.0;
// Hyller (gulv under hver rad) (mm)
hylle_t = 2.0;
// Styreskinner mellom kolonnene på hver hylle: bredde (mm)
skinne_b = 1.6;
// Styreskinner: høyde (mm)
skinne_h = 2.0;
// Fritt rom bak skuffene (bolter, stolper, pinner) (mm)
bak_rom = 10;
// Hjørnestolpe bak: bredde i X (mm)
stolpe_b = 6;
// Frontlist foran sokkel og topp (mm)
frontlist_t = 1.6;
// Tunge under hver modul som låser fronten mot modulen under: høyde (mm)
tunge_h_maks = 3;
// Tunge: bredde (mm)
tunge_b = 1.6;

/* [Sammenføyning] */
// Pinne mellom moduler i høyden: diameter (mm) – 3 mm stålstift, M3-gjengestang eller printet pinne
pinne_d = 3;
// Pinnehull: dybde i hver modul (mm)
pinne_dybde = 8;
// Bolt mellom moduler side om side: hull for M3 (mm)
bolt_hull = 3.4;
// Kjernehull for selvgjengende M3-skrue (lasker bak) (mm)
skrue_kjerne = 2.6;
// Avstand fra modulkant til laskhull (mm)
lask_z = 14;
// Lasktykkelse (mm)
lask_t = 3;

/* [Printer] */
// Byggeplate, kvadratisk (mm) – 220–256 er vanlig
byggeplate = 256;
// Margin på byggeplaten (skjørt/brim) (mm)
plate_margin = 10;
// Maks byggehøyde (mm)
byggehoyde = 250;
// Toleranse/klaring mellom deler som skal gli eller passe (mm)
toleranse = 0.4;

/* [Hidden] */
$fn = 40;
e = 0.01;

// ---------------------------------------------------------------------
// Avledede mål – hylla
// ---------------------------------------------------------------------
plass = byggeplate - plate_margin;
dmaks = dybde_maks > 0 ? dybde_maks : byggehoyde - 10;
ledig_side = hylle_bredde - raaco_bredde;                     // ≈ 260
rx0 = raaco_side == "venstre" ? 0 : hylle_bredde - raaco_bredde; // Raaco, venstre kant
tx0 = raaco_side == "venstre" ? raaco_bredde + klaring : klaring; // sidetårn, venstre kant
px0 = raaco_side == "venstre" ? klaring : rx0;                   // topphylle, venstre kant

// ---------------------------------------------------------------------
// Avledede mål – sidetårnet, små skuffer (som før)
// ---------------------------------------------------------------------
tarn_b = skap_bredde > 0 ? skap_bredde : ledig_side - 2 * klaring;   // 254
tarn_h = skap_hoyde > 0 ? skap_hoyde : raaco_hoyde;                  // 552
tarn_d = skap_dybde > 0 ? skap_dybde : min(hylle_dybde - klaring, dmaks); // 240

// Bredden deles i moduler som får plass på byggeplaten (264 -> 2 x 132)
moduler_x = max(1, ceil(tarn_b / plass));
modul_bredde = tarn_b / moduler_x;
indre_b = modul_bredde - 2 * veggtykkelse;

// Kolonner per modul og totalt (264 mm -> 4 skuffer à ca. 62 mm)
kpm_auto = max(1, round((indre_b + skinne_b) / (skuff_bredde_onsket + 2 * toleranse + skinne_b)));
kpm = kolonner_tvunget > 0 ? ceil(kolonner_tvunget / moduler_x) : kpm_auto;
kolonner = kpm * moduler_x;
slot = (indre_b - (kpm - 1) * skinne_b) / kpm;   // bredde per kolonne
skuff_bredde = slot - 2 * toleranse;

skuff_dybde = skuff_dybde_tvunget > 0 ? skuff_dybde_tvunget : tarn_d - bakvegg - bak_rom;
stolpe_d = tarn_d - bakvegg - skuff_dybde - 1;  // stolpene starter 1 mm bak skuffen
stolpe_yc = tarn_d - bakvegg - stolpe_d / 2;

// Høyder: sokkel under nederste hylle og topp over øverste rad
sokkel_h = nederste_skuff_z - hylle_t;
topp_h = tarn_h - sokkel_h - rader * rad_avstand;
luft_over = rad_avstand - hylle_t - skuff_hoyde;     // luft over skuffen
tunge_h = min(tunge_h_maks, luft_over - 1.5);

// Høyden deles i etasjer som får plass på byggeplaten (12 rader -> 3 x 4)
maks_rader = floor((plass - max(sokkel_h, topp_h)) / rad_avstand);
moduler_y = max(1, ceil(rader / maks_rader));

function rader_i(j) = floor(rader / moduler_y) + (j < rader % moduler_y ? 1 : 0);
function rader_under(j) = j <= 0 ? 0 : rader_i(j - 1) + rader_under(j - 1);
function rad_base(j) = j == 0 ? sokkel_h : 0;
function modul_h(j) = rad_base(j) + rader_i(j) * rad_avstand + (j == moduler_y - 1 ? topp_h : 0);
function modul_z(j) = j == 0 ? 0 : sokkel_h + rader_under(j) * rad_avstand;
// Rad (1 = øverst) -> etasje og lokal rad (0 = nederst i etasjen)
function rad_nedenfra(r) = rader - r;  // 0 = nederste rad
function etasje_for(n, j = 0) = n < rader_under(j) + rader_i(j) ? j : etasje_for(n, j + 1);

// Felles x-posisjon for kolonne c (0-basert) i en modul
function slot_x(c) = veggtykkelse + c * (slot + skinne_b);
function stolpe_xs() = [veggtykkelse + stolpe_b / 2, modul_bredde - veggtykkelse - stolpe_b / 2];

// ---------------------------------------------------------------------
// Avledede mål – seksjoner med store skuffer (felles regler)
// ---------------------------------------------------------------------
function sek_rader(H, tvunget) = tvunget > 0 ? tvunget
    : max(1, floor((H - hylle_t) / (stor_hoyde_onsket + stor_luft + hylle_t)));
function sek_kpm(mb, nx, tvunget) = tvunget > 0 ? ceil(tvunget / nx)
    : max(1, round((mb - 2 * veggtykkelse + skinne_b) / (stor_bredde_onsket + 2 * toleranse + skinne_b)));
function sek_slot(mb, k) = (mb - 2 * veggtykkelse - (k - 1) * skinne_b) / k;
function sek_pitch(H, R) = (H - hylle_t) / R;
function sek_sh(H, R) = sek_pitch(H, R) - hylle_t - stor_luft;       // skuffhøyde
function sek_sd(D) = D - bakvegg - bak_rom;                          // skuffdybde
// Bolter i sideskjøten per rad: 2 i høye rader, ellers 1
function sek_bolt_z(p) = p > 60 ? [1 / 3, 2 / 3] : [1 / 2];

// Sidetårn, store skuffer (står oppå små-skuff-delen, samme modulbredde)
ts_H = min(hylle_hoyde - klaring - tarn_h, plass);
ts_ubrukt = hylle_hoyde - klaring - tarn_h - ts_H;
ts_nx = moduler_x;
ts_mb = modul_bredde;
ts_D = tarn_d;
ts_R = sek_rader(ts_H, tarn_store_rader);
ts_kpm = sek_kpm(ts_mb, ts_nx, tarn_store_kolonner);
ts_K = ts_kpm * ts_nx;
ts_p = sek_pitch(ts_H, ts_R);
ts_slot = sek_slot(ts_mb, ts_kpm);
ts_sb = ts_slot - 2 * toleranse;
ts_sh = sek_sh(ts_H, ts_R);
ts_sd = sek_sd(ts_D);

// Topphylle over Raaco
tp_W = topp_bredde > 0 ? topp_bredde : raaco_bredde - klaring;
tp_H = min(hylle_hoyde - klaring - raaco_hoyde, plass);
tp_ubrukt = hylle_hoyde - klaring - raaco_hoyde - tp_H;
tp_D = topp_dybde > 0 ? topp_dybde : min(hylle_dybde - klaring, dmaks);
tp_nx = max(1, ceil(tp_W / plass));
tp_mb = tp_W / tp_nx;
tp_R = max(1, topp_rader);
tp_kpm = sek_kpm(tp_mb, tp_nx, topp_kolonner);
tp_K = tp_kpm * tp_nx;
tp_p = sek_pitch(tp_H, tp_R);
tp_slot = sek_slot(tp_mb, tp_kpm);
tp_sb = tp_slot - 2 * toleranse;
tp_sh = sek_sh(tp_H, tp_R);
tp_sd = sek_sd(tp_D);

// del="skuff_stor": egne mål, ellers som topphylla
st_b = skuff_stor_bredde > 0 ? skuff_stor_bredde : tp_sb;
st_h = skuff_stor_hoyde > 0 ? skuff_stor_hoyde : tp_sh;
st_d = skuff_stor_dybde > 0 ? skuff_stor_dybde : tp_sd;

// ---------------------------------------------------------------------
// Avledede mål – kasser
// ---------------------------------------------------------------------
kasse_d_auto = min(hylle_dybde - klaring, plass - kasse_grep_ut);
function kasse_mal(m) = [m[0], m[1] > 0 ? m[1] : kasse_d_auto, m[2]];
ks = kasse_mal(kasse_s);
km = kasse_mal(kasse_m);
kl = kasse_mal(kasse_l);
kl_deles = kl[0] > plass;
bk_ledig_d = hylle_dybde - raaco_dybde - klaring;
bk = [bakkasse[0] > 0 ? bakkasse[0] : (raaco_bredde - klaring - 2) / 2,
      bakkasse[1] > 0 ? bakkasse[1] : bk_ledig_d - kasse_grep_ut,
      bakkasse[2]];
bk_aktiv = lag_bakkasser && bk_ledig_d >= 40;
function kasse_steg(m) = m[2] - kasse_fot_h - toleranse;     // stablehøyde
function kasse_zf(m) = kasse_bunn + kasse_front_andel * (m[2] - kasse_bunn); // overkant front
function kasse_etikett_topp(m) = kasse_zf(m) - kasse_grep_ut - 1.5 - 1.5;
bk_nx = max(1, floor((raaco_bredde - klaring + 2) / (bk[0] + 2)));
bk_ny = max(0, floor((raaco_hoyde - bk[2]) / kasse_steg(bk)) + 1);

// ---------------------------------------------------------------------
// Kontroller
// ---------------------------------------------------------------------
assert(raaco_side == "venstre" || raaco_side == "hoyre", "raaco_side må være \"venstre\" eller \"hoyre\".");
assert(ledig_side - 2 * klaring >= 60, str("For lite plass ved siden av Raaco (", ledig_side, " mm). Sjekk hylle_bredde og raaco_bredde."));
assert(tarn_b <= ledig_side, str("skap_bredde (", tarn_b, " mm) er bredere enn ledig plass ved siden av Raaco (", ledig_side, " mm)."));
assert(raaco_hoyde + klaring <= hylle_hoyde, "Raaco-skapet er høyere enn hylla. Sjekk hylle_hoyde og raaco_hoyde.");
assert(tarn_h + klaring <= hylle_hoyde, "Sidetårnet (skap_hoyde) er høyere enn hylla.");
assert(raaco_dybde <= hylle_dybde, "Raaco-skapet er dypere enn hylla. Sjekk hylle_dybde og raaco_dybde.");
assert(luft_over >= toleranse + 1, str("For lite luft over skuffen (", luft_over, " mm). Sjekk rad_avstand, hylle_t og skuff_hoyde."));
assert(sokkel_h >= hylle_t, "nederste_skuff_z er for liten i forhold til hylle_t.");
assert(topp_h >= hylle_t, str("Toppen blir for tynn (", topp_h, " mm). Sjekk raaco_hoyde/skap_hoyde, rad_avstand og nederste_skuff_z."));
assert(maks_rader >= 1, "rad_avstand er større enn byggeplaten.");
assert(bak_rom >= 7, "bak_rom må være minst 7 mm (plass til stolper og bolter).");
assert(skuff_bredde >= 20, "Skuffene blir for smale – sett kolonner_tvunget lavere.");
assert(tarn_d <= byggehoyde, str("Rammene printes liggende på ryggen, så dybden (", tarn_d, " mm) må være <= byggehoyde (", byggehoyde, " mm). Sett dybde_maks/skap_dybde lavere."));
assert(skuff_dybde + grep_ut <= plass, str("Skuffen (", skuff_dybde, " mm dyp) får ikke plass på byggeplaten. Sett dybde_maks lavere."));
assert(stolpe_d >= stolpe_b - 1, "For lite plass bak skuffene til stolpene – sjekk skuff_dybde_tvunget og bak_rom.");
for (j = [0 : moduler_y - 1]) assert(modul_h(j) + tunge_h <= plass, str("Etasje ", j, " er for høy for byggeplaten."));

assert(!lag_tarn_store || ts_H >= 40, str("Bare ", ts_H, " mm over sidetårnet – for lite til store skuffer. Sett lag_tarn_store = false."));
assert(!lag_tarn_store || ts_sh >= 20, str("Store skuffer i sidetårnet blir bare ", ts_sh, " mm høye – sett tarn_store_rader lavere."));
assert(!lag_tarn_store || ts_sb >= 30, "Store skuffer i sidetårnet blir for smale – sett tarn_store_kolonner lavere.");
assert(!lag_tarn_store || ts_sd + grep_ut <= plass, "Store skuffer i sidetårnet er for dype for byggeplaten. Sett dybde_maks lavere.");
assert(!lag_tarn_store || ts_sh + 1 <= byggehoyde, "Store skuffer i sidetårnet er for høye for printeren.");

assert(!lag_topphylle || tp_H >= 40, str("Bare ", tp_H, " mm over Raaco – for lite til topphylle. Sett lag_topphylle = false."));
assert(!lag_topphylle || tp_W <= raaco_bredde, "topp_bredde er bredere enn Raaco-skapet.");
assert(!lag_topphylle || tp_mb <= plass, "Topphyllemodulene er for brede for byggeplaten.");
assert(!lag_topphylle || tp_D <= byggehoyde, str("Topphylla printes liggende på ryggen, så topp_dybde (", tp_D, " mm) må være <= byggehoyde."));
assert(!lag_topphylle || tp_D <= hylle_dybde, "topp_dybde er dypere enn hylla.");
assert(!lag_topphylle || tp_sh >= 20, str("Topphylleskuffene blir bare ", tp_sh, " mm høye – sett topp_rader lavere."));
assert(!lag_topphylle || tp_sb >= 30, "Topphylleskuffene blir for smale – sett topp_kolonner lavere.");
assert(!lag_topphylle || tp_sd + grep_ut <= plass, "Topphylleskuffene er for dype for byggeplaten. Sett topp_dybde lavere.");
assert(!lag_topphylle || tp_sh + 1 <= byggehoyde, "Topphylleskuffene er for høye for printeren.");

assert(ks[0] <= plass && km[0] <= plass, "Kasse S og M må være smalere enn byggeplaten (bare L deles i to).");
assert(kl[0] / 2 <= plass, "Kasse L er for bred selv når den deles i to.");
for (m = [ks, km, kl, bk]) {
    assert(m[1] + kasse_grep_ut <= plass, str("Kassen ", m, " er for dyp for byggeplaten (dybde + grep <= ", plass, " mm)."));
    assert(m[2] <= byggehoyde, str("Kassen ", m, " er for høy for printeren."));
    assert(kasse_etikett_topp(m) - etikett_h >= kasse_fot_h + kasse_vegg + toleranse + 1,
           str("Kassen ", m, " er for lav for grep og etikettfelt – øk høyden eller kasse_front_andel."));
}
assert(ks[0] <= hylle_bredde && km[0] <= hylle_bredde && kl[0] <= hylle_bredde, "En kasse er bredere enn hylla.");
assert(ks[1] <= hylle_dybde && km[1] <= hylle_dybde && kl[1] <= hylle_dybde, "En kasse er dypere enn hylla.");

// ---------------------------------------------------------------------
// Oversikt i konsollen
// ---------------------------------------------------------------------
echo(str("SKJOLDLAB3D: hylle ", hylle_bredde, " x ", hylle_dybde, " x ", hylle_hoyde, " mm (B x D x H), Raaco ", raaco_bredde, " x ", raaco_dybde, " x ", raaco_hoyde, " mm til ", raaco_side,
         ", ledig ved siden av ", ledig_side, " mm, over ", hylle_hoyde - raaco_hoyde, " mm, bak ", hylle_dybde - raaco_dybde, " mm"));
echo(str("SKJOLDLAB3D: ", rader, " rader x ", kolonner, " kolonner = ", rader * kolonner, " skuffer"));
echo(str("SKJOLDLAB3D: skuff ", skuff_bredde, " x ", skuff_dybde, " x ", skuff_hoyde, " mm (B x D x H), luft over ", luft_over, " mm"));
echo(str("SKJOLDLAB3D: ", moduler_x, " x ", moduler_y, " = ", moduler_x * moduler_y, " rammemoduler à ", modul_bredde, " mm bredde, høyder ",
         [for (j = [0 : moduler_y - 1]) modul_h(j)], " mm, rader per etasje ", [for (j = [0 : moduler_y - 1]) rader_i(j)]));
echo(str("SKJOLDLAB3D: sokkel ", sokkel_h, " mm, topp ", topp_h, " mm, totalhøyde ", sokkel_h + rader * rad_avstand + topp_h, " mm, rammedybde ", tarn_d,
         " mm (", hylle_dybde - klaring - tarn_d, " mm ledig bak)"));
echo(str("SKJOLDLAB3D: deler: ", (moduler_y - 1) * 2, " lask, ", (moduler_y - 1) * (moduler_x - 1), " lask4, ",
         (moduler_y - 1) * moduler_x * 2, " pinner, ", rader * (moduler_x - 1), " M3x20-bolter m/mutter, ",
         (moduler_y - 1) * (2 * 2 + (moduler_x - 1) * 4), " M3x10 selvgjengende skruer"));
if (lag_tarn_store) {
    echo(str("SKJOLDLAB3D: sidetarn store: ", ts_R, " rader x ", ts_K, " kolonner = ", ts_R * ts_K, " store skuffer ", ts_sb, " x ", ts_sd, " x ", ts_sh,
             " mm, seksjon ", tarn_b, " x ", ts_D, " x ", ts_H, " mm", ts_ubrukt > 0 ? str(" (", ts_ubrukt, " mm ubrukt over – større enn byggeplaten)") : ""));
    echo(str("SKJOLDLAB3D: tarnstor moduler ", ts_nx, "; deler: ", ts_nx * 2, " pinner, 2 lask, ", ts_nx - 1, " lask4, ",
             (ts_nx - 1) * ts_R * len(sek_bolt_z(ts_p)), " M3x20-bolter m/mutter, ", 2 * 2 + (ts_nx - 1) * 4, " M3x10 selvgjengende skruer"));
}
if (lag_topphylle) {
    echo(str("SKJOLDLAB3D: topphylle: ", tp_R, " rader x ", tp_K, " kolonner = ", tp_R * tp_K, " store skuffer ", tp_sb, " x ", tp_sd, " x ", tp_sh,
             " mm, seksjon ", tp_W, " x ", tp_D, " x ", tp_H, " mm", tp_ubrukt > 0 ? str(" (", tp_ubrukt, " mm ubrukt over – større enn byggeplaten)") : ""));
    echo(str("SKJOLDLAB3D: topphylle moduler ", tp_nx, "; deler: ", (tp_nx - 1) * tp_R * len(sek_bolt_z(tp_p)), " M3x20-bolter m/mutter"));
}
echo(str("SKJOLDLAB3D: kasser: S ", ks, " x ", kasse_antall[0], ", M ", km, " x ", kasse_antall[1], ", L ", kl, " x ", kasse_antall[2],
         " (B x D x H mm), stablehøyde S ", kasse_steg(ks), " mm"));
echo(kl_deles ? str("SKJOLDLAB3D: kasse L er bredere enn byggeplaten – print kasse_l_1 + kasse_l_2 og skru sammen med 5 M3x12 + mutter per kasse")
              : "SKJOLDLAB3D: kasse L hel – får plass på byggeplaten");
echo(bk_aktiv ? str("SKJOLDLAB3D: bakkasser: ", bk_nx, " i bredden x ", bk_ny, " stablet = ", bk_nx * bk_ny, " stk à ", bk, " mm bak Raaco")
              : "SKJOLDLAB3D: bakkasser: ingen (for lite plass bak Raaco eller lag_bakkasser = false)");
echo(str("SKJOLDLAB3D: Skjold Lab: «Sidetårn (3D)» ", rader, " x ", kolonner,
         lag_tarn_store ? str(", «Sidetårn store» ", ts_R, " x ", ts_K) : "",
         lag_topphylle ? str(", «Topphylle (3D)» ", tp_R, " x ", tp_K) : "",
         ", «Kasser» 1 x ", kasse_antall[0] + kasse_antall[1] + kasse_antall[2],
         bk_aktiv ? str(", «Bak Raaco» ", bk_ny, " x ", bk_nx) : ""));

// ---------------------------------------------------------------------
// Hjelpere
// ---------------------------------------------------------------------
// Dråpeformet hull (spiss mot -v) så liggende hull printes uten support
module draape2d(d) {
    r = d / 2;
    union() {
        circle(r = r);
        polygon([[-r * sqrt(0.5), -r * sqrt(0.5)], [r * sqrt(0.5), -r * sqrt(0.5)], [0, -r * sqrt(2)]]);
    }
}
// Langs +Z fra z=0, spiss mot skapets front (-Y)
module draape_z(d, h) { linear_extrude(h) draape2d(d); }
// Langs +X fra x=0, spiss mot skapets front (-Y)
module draape_x(d, h) { rotate([0, 90, 0]) linear_extrude(h) draape2d(d); }
// Langs +X fra x=0, spiss opp (+Z) – for deler som printes stående
module draape_x_opp(d, h) { rotate([0, 90, 0]) linear_extrude(h) rotate([0, 0, -90]) draape2d(d); }

// ---------------------------------------------------------------------
// Skuff (origo: front-venstre-bunn av skuffkroppen, front mot -Y)
// ---------------------------------------------------------------------
module skuff_g(w, d, h, t, bunn, front, gmaks) {
    ribbe = 1.0;                          // sporribbe: tykkelse og dybde
    gap = skillevegg_t + toleranse;       // sporbredde
    L = d - front - t;                    // innvendig dybde
    grep_b = min(w * 0.6, gmaks);
    eb = w - 8;
    difference() {
        union() {
            cube([w, d, h]);
            // Håndtak: leppe nederst på fronten, 45° overside -> ingen support
            translate([(w - grep_b) / 2, 0, 0])
                rotate([90, 0, 90]) linear_extrude(grep_b)
                    polygon([[0, 0], [-grep_ut, 0], [-grep_ut, grep_tykk], [0, grep_tykk + grep_ut]]);
        }
        // Innvendig rom
        translate([t, front, bunn]) cube([w - 2 * t, L, h]);
        // Etikettfelt (forsenkning for klistrelapp/papir), øverst på fronten
        translate([(w - eb) / 2, -e, h - 2.5 - etikett_h]) cube([eb, etikett_dybde + e, etikett_h]);
    }
    // Spor for skillevegger: ribbepar på begge sidevegger
    for (p = spor_posisjoner) {
        yc = front + p * L;
        for (dy = [-(gap / 2 + ribbe), gap / 2]) {
            translate([t - e, yc + dy, bunn - e]) cube([ribbe + e, ribbe, h - bunn - 1.5]);
            translate([w - t - ribbe, yc + dy, bunn - e]) cube([ribbe + e, ribbe, h - bunn - 1.5]);
        }
    }
}
module skuff() { skuff_g(skuff_bredde, skuff_dybde, skuff_hoyde, skuff_vegg, skuff_bunn, skuff_front, 36); }
module skuff_stor_g(w, d, h) { skuff_g(w, d, h, stor_vegg, stor_bunn, stor_front, stor_grep_maks); }

// Skillevegg, liggende for print
module skillevegg_g(bw, bh) {
    difference() {
        cube([bw, bh, skillevegg_t]);
        // Fingergrep øverst (halvsirkel), gjør veggen lett å løfte ut
        translate([bw / 2, bh + 2, -e]) cylinder(r = 5, h = skillevegg_t + 2 * e);
    }
}
module skillevegg() { skillevegg_g(skuff_bredde - 2 * skuff_vegg - toleranse, skuff_hoyde - skuff_bunn - 1); }
module skillevegg_stor_g(w, h) { skillevegg_g(w - 2 * stor_vegg - toleranse, h - stor_bunn - 1); }

// ---------------------------------------------------------------------
// Rammemodul for små skuffer (i = kolonne av moduler, j = etasje)
// ---------------------------------------------------------------------
module kasse_ramme(z0, h, med_bunn, med_tak) {
    mb = modul_bredde; D = tarn_d;
    if (h < 2 * hylle_t + 2) {
        translate([0, 0, z0]) cube([mb, D, h]);
    } else {
        if (med_bunn) translate([0, 0, z0]) cube([mb, D, hylle_t]);
        if (med_tak) translate([0, 0, z0 + h - hylle_t]) cube([mb, D, hylle_t]);
        translate([0, 0, z0]) cube([mb, frontlist_t, h]);
    }
}

module ramme_modul(i, j) {
    mb = modul_bredde; D = tarn_d; H = modul_h(j); n = rader_i(j); zb = rad_base(j);
    venstre_skjot = i > 0;
    hoyre_skjot = i < moduler_x - 1;
    // Pinnehull på toppen også i øverste etasje når store skuffer står oppå
    pinner_opp = j < moduler_y - 1 || lag_tarn_store;
    difference() {
        union() {
            // Sidevegger og bakvegg
            cube([veggtykkelse, D, H]);
            translate([mb - veggtykkelse, 0, 0]) cube([veggtykkelse, D, H]);
            translate([0, D - bakvegg, 0]) cube([mb, bakvegg, H]);
            // Hylle (gulv) under hver rad, med styreskinner og bakstopp
            for (k = [0 : n - 1]) translate([0, 0, zb + k * rad_avstand]) {
                cube([mb, D, hylle_t]);
                if (kpm > 1) for (c = [1 : kpm - 1])
                    translate([slot_x(c) - skinne_b, 0, hylle_t - e]) cube([skinne_b, D - bakvegg, skinne_h + e]);
                // Bakstopp: skuffen stopper med fronten i flukt med rammen
                translate([veggtykkelse, skuff_dybde + 0.3, hylle_t - e]) cube([indre_b, D - bakvegg - skuff_dybde - 0.3 + e, skinne_h + e]);
            }
            // Sokkel (nederste etasje) og topp (øverste etasje)
            if (j == 0) kasse_ramme(0, sokkel_h, true, false);
            if (j == moduler_y - 1) kasse_ramme(zb + n * rad_avstand, topp_h, true, true);
            // Hjørnestolper bak (bak skuffene), full høyde
            for (x = stolpe_xs()) translate([x - stolpe_b / 2, D - bakvegg - stolpe_d, 0]) cube([stolpe_b, stolpe_d + e, H]);
            // Tunger under gulvet som griper innenfor sideveggene på modulen under
            if (j > 0) for (x = [veggtykkelse + toleranse / 2, mb - veggtykkelse - toleranse / 2 - tunge_b])
                translate([x, 5, -tunge_h]) cube([tunge_b, skuff_dybde - 5, tunge_h + e]);
        }
        // Pinnehull i stolpene (opp og ned)
        for (x = stolpe_xs()) {
            if (j > 0) translate([x, stolpe_yc, -e]) draape_z(pinne_d + toleranse, pinne_dybde + e);
            if (pinner_opp) translate([x, stolpe_yc, H - pinne_dybde]) draape_z(pinne_d + toleranse, pinne_dybde + e);
            // Kjernehull for lasker (gjennom bakveggen inn i stolpen)
            for (z = [lask_z, H - lask_z])
                translate([x, D + e, z]) rotate([90, 0, 0]) cylinder(d = skrue_kjerne, h = bakvegg + stolpe_d - 1);
        }
        // Boltehull mellom moduler side om side: ett per rad, midt i raden, gjennom vegg + stolpe
        for (k = [0 : n - 1]) {
            z = zb + k * rad_avstand + hylle_t + (rad_avstand - hylle_t) / 2;
            if (venstre_skjot) translate([-e, stolpe_yc, z]) draape_x(bolt_hull, veggtykkelse + stolpe_b + 2 * e);
            if (hoyre_skjot) translate([mb - veggtykkelse - stolpe_b - e, stolpe_yc, z]) draape_x(bolt_hull, veggtykkelse + stolpe_b + 2 * e);
        }
    }
}

// ---------------------------------------------------------------------
// Rammemodul for store skuffer (sidetårn store og topphylle)
// mb = modulbredde, H = høyde, D = dybde, R = rader, k = kolonner i modulen
// ---------------------------------------------------------------------
module stor_ramme(mb, H, D, R, k, venstre_skjot, hoyre_skjot, pinner_under) {
    p = sek_pitch(H, R);
    ib = mb - 2 * veggtykkelse;
    sl = sek_slot(mb, k);
    sd = sek_sd(D);
    sdp = D - bakvegg - sd - 1;            // stolpedybde
    syc = D - bakvegg - sdp / 2;
    xs = [veggtykkelse + stolpe_b / 2, mb - veggtykkelse - stolpe_b / 2];
    difference() {
        union() {
            cube([veggtykkelse, D, H]);
            translate([mb - veggtykkelse, 0, 0]) cube([veggtykkelse, D, H]);
            translate([0, D - bakvegg, 0]) cube([mb, bakvegg, H]);
            for (r = [0 : R - 1]) translate([0, 0, r * p]) {
                cube([mb, D, hylle_t]);
                if (k > 1) for (c = [1 : k - 1])
                    translate([veggtykkelse + c * (sl + skinne_b) - skinne_b, 0, hylle_t - e]) cube([skinne_b, D - bakvegg, skinne_h + e]);
                translate([veggtykkelse, sd + 0.3, hylle_t - e]) cube([ib, D - bakvegg - sd - 0.3 + e, skinne_h + e]);
            }
            // Tak
            translate([0, 0, H - hylle_t]) cube([mb, D, hylle_t]);
            // Hjørnestolper bak
            for (x = xs) translate([x - stolpe_b / 2, D - bakvegg - sdp, 0]) cube([stolpe_b, sdp + e, H]);
        }
        for (x = xs) {
            if (pinner_under) translate([x, syc, -e]) draape_z(pinne_d + toleranse, pinne_dybde + e);
            for (z = [lask_z, H - lask_z])
                translate([x, D + e, z]) rotate([90, 0, 0]) cylinder(d = skrue_kjerne, h = bakvegg + sdp - 1);
        }
        for (r = [0 : R - 1], f = sek_bolt_z(p)) {
            z = r * p + hylle_t + (p - hylle_t) * f;
            if (venstre_skjot) translate([-e, syc, z]) draape_x(bolt_hull, veggtykkelse + stolpe_b + 2 * e);
            if (hoyre_skjot) translate([mb - veggtykkelse - stolpe_b - e, syc, z]) draape_x(bolt_hull, veggtykkelse + stolpe_b + 2 * e);
        }
    }
}
module tarn_stor_modul(i) { stor_ramme(ts_mb, ts_H, ts_D, ts_R, ts_kpm, i > 0, i < ts_nx - 1, true); }
module topp_modul(i) { stor_ramme(tp_mb, tp_H, tp_D, tp_R, tp_kpm, i > 0, i < tp_nx - 1, false); }

// ---------------------------------------------------------------------
// Løs kasse: åpen front, grepsleppe, etikettfelt, stablefot
// (origo: front-venstre-bunn, front mot -Y, printes stående)
// ---------------------------------------------------------------------
module kasse_ytre(m) {
    w = m[0]; d = m[1]; h = m[2]; inn = kasse_vegg + toleranse; fh = kasse_fot_h;
    hull() {
        translate([inn, inn, 0]) cube([w - 2 * inn, d - 2 * inn, fh]);
        translate([0, 0, fh + inn]) cube([w, d, h - fh - inn]);
    }
}
module kasse_hulrom(m) {
    w = m[0]; d = m[1]; h = m[2]; t = kasse_vegg; inn = t + toleranse; fh = kasse_fot_h;
    hull() {
        translate([inn + t, inn + t, kasse_bunn]) cube([w - 2 * (inn + t), d - 2 * (inn + t), fh - kasse_bunn + e]);
        translate([t, t, fh + inn]) cube([w - 2 * t, d - 2 * t, h - fh - inn + 1]);
    }
}
// Skrå åpning foran: fra overkant front (y=0) opp til full høyde ved y = kasse_skra * d
module kasse_frontkutt(m) {
    d = m[1]; h = m[2]; zf = kasse_zf(m); dc = kasse_skra * d;
    translate([-1, 0, 0]) rotate([90, 0, 90]) linear_extrude(m[0] + 2)
        polygon([[-1, zf], [0, zf], [dc, h], [dc, h + 1], [-1, h + 1]]);
}
module kasse_hel(m) {
    w = m[0]; d = m[1]; h = m[2]; zf = kasse_zf(m); g = kasse_grep_ut;
    gb = min(w * 0.6, 80);
    eb = min(w - 16, 90);
    et = kasse_etikett_topp(m);
    difference() {
        union() {
            kasse_ytre(m);
            // Grepsleppe ved overkant front, 45° underside -> ingen support
            translate([(w - gb) / 2, 0, 0]) rotate([90, 0, 90]) linear_extrude(gb)
                polygon([[e, zf - g - 1.5], [e, zf], [-g, zf], [-g, zf - 1.5]]);
        }
        kasse_hulrom(m);
        kasse_frontkutt(m);
        // Etikettfelt under grepet
        translate([(w - eb) / 2, -e, et - etikett_h]) cube([eb, etikett_dybde + e, etikett_h]);
    }
}
// Skjøtflens langs bunn, bakvegg og lav front på delesnittet (x = w/2)
module kasse_flens(m, side) {
    w = m[0]; d = m[1]; h = m[2]; fl = kasse_flens_b; ft = kasse_flens_t; t = kasse_vegg;
    x0 = side == 0 ? w / 2 - ft : w / 2;
    difference() {
        intersection() {
            // Stopper under kanten så stablefoten til kassen over går klar
            translate([x0, -1, -1]) cube([ft, d + 2, h - kasse_fot_h]);
            kasse_ytre(m);
        }
        translate([x0 - 1, t + fl, kasse_bunn + fl]) cube([ft + 2, d - 2 * t - 2 * fl, h]);
        kasse_frontkutt(m);
    }
}
function kasse_skjothull(m) = let(d = m[1], h = m[2], t = kasse_vegg, fl = kasse_flens_b, zf = kasse_zf(m))
    [[d / 3, kasse_bunn + fl / 2], [2 * d / 3, kasse_bunn + fl / 2],
     [d - t - fl / 2, h * 0.45], [d - t - fl / 2, h - 12],
     [t + fl / 2, (kasse_bunn + zf) / 2]];
// Halvdel av en kasse (side 0 = venstre, 1 = høyre), skrus sammen med M3x12 + mutter
module kasse_halv(m, side) {
    w = m[0]; d = m[1]; h = m[2]; ft = kasse_flens_t;
    difference() {
        union() {
            intersection() {
                kasse_hel(m);
                translate([side == 0 ? -50 : w / 2, -50, -1]) cube([w / 2 + 50, d + 100, h + 2]);
            }
            kasse_flens(m, side);
        }
        for (p = kasse_skjothull(m))
            translate([w / 2 - ft - 1, p[0], p[1]]) draape_x_opp(bolt_hull, 2 * ft + 2);
    }
}

// ---------------------------------------------------------------------
// Små deler
// ---------------------------------------------------------------------
// Lask bak over en etasjeskjøt: 2 hull (ytterkant) eller 4 hull (der to moduler møtes)
module lask(fire) {
    dx = stolpe_b + 2 * veggtykkelse;     // avstand mellom stolpene på hver side av en sideskjøt
    w = fire ? dx + 10 : 10;
    l = 2 * lask_z + 10;
    difference() {
        translate([-w / 2, -l / 2, 0]) cube([w, l, lask_t]);
        for (x = fire ? [-dx / 2, dx / 2] : [0], y = [-lask_z, lask_z])
            translate([x, y, -e]) {
                cylinder(d = 3.4, h = lask_t + 2 * e);
                translate([0, 0, lask_t - 1.6]) cylinder(d1 = 3.4, d2 = 6.6, h = 1.6 + 2 * e); // forsenket
            }
    }
}

// Printet pinne, liggende med flat underside
module pinne() {
    l = 2 * pinne_dybde - 1;
    difference() {
        translate([0, 0, pinne_d / 2 - 0.3]) rotate([0, 90, 0]) cylinder(d = pinne_d, h = l, $fn = 24);
        translate([-e, -pinne_d, -pinne_d]) cube([l + 2 * e, 2 * pinne_d, pinne_d]);
    }
}

// ---------------------------------------------------------------------
// Utlegg for print
// ---------------------------------------------------------------------
// Rammemoduler for print: liggende på ryggen (bakveggen ned)
module modul_print(i, j) { translate([0, 0, tarn_d]) rotate([-90, 0, 0]) ramme_modul(i, j); }
module tarn_stor_print(i) { translate([0, 0, ts_D]) rotate([-90, 0, 0]) tarn_stor_modul(i); }
module topp_print(i) { translate([0, 0, tp_D]) rotate([-90, 0, 0]) topp_modul(i); }

module skuff_print() { translate([0, grep_ut, 0]) skuff(); }
module skuff_stor_print(w, d, h) { translate([0, grep_ut, 0]) skuff_stor_g(w, d, h); }
module kasse_print(m) { translate([0, kasse_grep_ut, 0]) kasse_hel(m); }
module kasse_halv_print(m, side) { translate([side == 0 ? 0 : -m[0] / 2, kasse_grep_ut, 0]) kasse_halv(m, side); }

module skuffplate() {
    nx = max(1, floor((plass + 5) / (skuff_bredde + 5)));
    ny = max(1, floor((plass + 5) / (skuff_dybde + grep_ut + 5)));
    for (a = [0 : nx - 1], b = [0 : ny - 1])
        translate([a * (skuff_bredde + 5), b * (skuff_dybde + grep_ut + 5), 0]) skuff_print();
    echo(str("SKJOLDLAB3D: skuffplate = ", nx * ny, " skuffer per plate"));
}

module skilleplate() {
    bw = skuff_bredde - 2 * skuff_vegg - toleranse;
    bh = skuff_hoyde - skuff_bunn - 1;
    nx = max(1, floor((plass + 4) / (bw + 4)));
    ny = max(1, floor((plass + 4) / (bh + 4)));
    for (a = [0 : nx - 1], b = [0 : ny - 1]) translate([a * (bw + 4), b * (bh + 4), 0]) skillevegg();
    echo(str("SKJOLDLAB3D: skilleplate = ", nx * ny, " skillevegger per plate"));
}

// ---------------------------------------------------------------------
// Visning
// ---------------------------------------------------------------------
farge_ramme = [0.13, 0.13, 0.14];
farge_skuff = [0.85, 0.9, 0.95, 0.55];

// Sidetårnets små-skuff-del (origo: front-venstre-bunn av tårnet)
module samlet() {
    for (i = [0 : moduler_x - 1], j = [0 : moduler_y - 1])
        translate([i * modul_bredde, 0, modul_z(j)]) color(farge_ramme) ramme_modul(i, j);
    if (vis_skuffer)
        for (r = [1 : rader], c = [0 : kolonner - 1]) {
            n = rad_nedenfra(r);
            j = etasje_for(n);
            k = n - rader_under(j);
            i = floor(c / kpm);
            cl = c % kpm;
            translate([i * modul_bredde + slot_x(cl) + toleranse,
                       0,
                       modul_z(j) + rad_base(j) + k * rad_avstand + hylle_t])
                color(farge_skuff) skuff();
        }
}

// En seksjon med store skuffer (origo: front-venstre-bunn)
module stor_seksjon(nx, mb, H, D, R, k, tarn) {
    p = sek_pitch(H, R); sl = sek_slot(mb, k);
    for (i = [0 : nx - 1]) translate([i * mb, 0, 0]) {
        color(farge_ramme) if (tarn) tarn_stor_modul(i); else topp_modul(i);
        if (vis_skuffer) for (r = [0 : R - 1], c = [0 : k - 1])
            translate([veggtykkelse + c * (sl + skinne_b) + toleranse, 0, r * p + hylle_t])
                color(farge_skuff) skuff_stor_g(sl - 2 * toleranse, sek_sd(D), sek_sh(H, R));
    }
}

module hylla() {
    b = 18;  // platetykkelse, bare for visning
    color([0.75, 0.6, 0.42, 0.35]) {
        translate([-b, 0, -b]) cube([hylle_bredde + 2 * b, hylle_dybde, b]);
        translate([-b, 0, hylle_hoyde]) cube([hylle_bredde + 2 * b, hylle_dybde, b]);
        translate([-b, 0, 0]) cube([b, hylle_dybde, hylle_hoyde]);
        translate([hylle_bredde, 0, 0]) cube([b, hylle_dybde, hylle_hoyde]);
        translate([0, hylle_dybde, 0]) cube([hylle_bredde, 4, hylle_hoyde]);
    }
}

module oversikt() {
    hylla();
    // Raaco som grå blokk
    color([0.5, 0.5, 0.52]) translate([rx0, 0, 0]) cube([raaco_bredde, raaco_dybde, raaco_hoyde]);
    // Sidetårn: små skuffer + store skuffer oppå
    translate([tx0, 0, 0]) samlet();
    if (lag_tarn_store) translate([tx0, 0, tarn_h]) stor_seksjon(ts_nx, ts_mb, ts_H, ts_D, ts_R, ts_kpm, true);
    // Topphylle over Raaco
    if (lag_topphylle) translate([px0, 0, raaco_hoyde]) stor_seksjon(tp_nx, tp_mb, tp_H, tp_D, tp_R, tp_kpm, false);
    // Bakkasser bak Raaco
    if (bk_aktiv) for (a = [0 : bk_nx - 1], b = [0 : bk_ny - 1])
        translate([rx0 + (raaco_side == "venstre" ? klaring : 0) + a * (bk[0] + 2), raaco_dybde + kasse_grep_ut, b * kasse_steg(bk)])
            color([0.35, 0.55, 0.75, 0.8]) kasse_hel(bk);
    // Løse kasser ved siden av hylla (de kan stå hvor som helst)
    x_k = hylle_bredde + 18 + 60;
    liste = [for (s = [0 : 2]) for (n = [0 : max(0, kasse_antall[s]) - 1]) if (kasse_antall[s] > 0) s];
    maal = [ks, km, kl];
    for (q = [0 : len(liste) - 1]) {
        s = liste[q];
        x = x_k + (q == 0 ? 0 : sum_bredde(liste, maal, q));
        translate([x, 0, 0]) color([0.95, 0.7, 0.2, 0.85]) kasse_hel(maal[s]);
    }
}
function sum_bredde(liste, maal, q) = q <= 0 ? 0 : maal[liste[q - 1]][0] + 10 + sum_bredde(liste, maal, q - 1);

// ---------------------------------------------------------------------
// Valg av del
// ---------------------------------------------------------------------
if (del == "samlet") samlet();
else if (del == "oversikt") oversikt();
else if (del == "modul") modul_print(min(modul_x, moduler_x - 1), min(modul_y, moduler_y - 1));
else if (del == "skuff") skuff_print();
else if (del == "skuffplate") skuffplate();
else if (del == "skillevegg") skillevegg();
else if (del == "skilleplate") skilleplate();
else if (del == "lask") lask(false);
else if (del == "lask4") lask(true);
else if (del == "pinne") pinne();
else if (del == "tarn_stor_modul") { assert(lag_tarn_store, "lag_tarn_store er av."); tarn_stor_print(min(modul_x, ts_nx - 1)); }
else if (del == "skuff_tarn_stor") skuff_stor_print(ts_sb, ts_sd, ts_sh);
else if (del == "skillevegg_tarn_stor") skillevegg_stor_g(ts_sb, ts_sh);
else if (del == "topp_modul") { assert(lag_topphylle, "lag_topphylle er av."); topp_print(min(modul_x, tp_nx - 1)); }
else if (del == "skuff_topp") skuff_stor_print(tp_sb, tp_sd, tp_sh);
else if (del == "skillevegg_topp") skillevegg_stor_g(tp_sb, tp_sh);
else if (del == "skuff_stor") skuff_stor_print(st_b, st_d, st_h);
else if (del == "skillevegg_stor") skillevegg_stor_g(st_b, st_h);
else if (del == "kasse_s") kasse_print(ks);
else if (del == "kasse_m") kasse_print(km);
else if (del == "kasse_l") kasse_print(kl);
else if (del == "kasse_l_1") kasse_halv_print(kl, 0);
else if (del == "kasse_l_2") kasse_halv_print(kl, 1);
else if (del == "bakkasse") kasse_print(bk);
else assert(false, str("Ukjent del: ", del));
