// =====================================================================
// Skjold Lab – LED-vegg med skuffer (lys over skuffen du leter etter)
// =====================================================================
// Parametrisk OpenSCAD-modell (prompt 78). Stilen er som på brukerens bilde:
// sorte, 3D-printede skuffer i rader, og over hver rad en kanal med en
// adresserbar LED-stripe (WS2812B/SK6812, 5 V). Skjold Lab sender et kall
// til WLED, og LED-en over skuffen lyser.
//
// Hylla er 560 x 760 x 320 mm (B x H x D). To varianter (variant):
//   "hele_hylla" (standard): hele hylla er ett sorteringsskap med LED,
//                uten Raaco. 11 x 13 = 143 skuffer med standardmålene.
//   "rundt_raaco": Raaco-skapet (300 x 150 x 552 mm) står nederst inntil
//                én side, og LED-veggen fyller resten: (a) SIDEVEGG i full
//                høyde og (b) TOPPVEGG over Raaco. Raaco får sin egen
//                LED-SKINNE over hver rad (del="raaco_skinne"/"raaco_klips").
// ELEKTRONIKKBOKSEN (del="elboks"/"elboks_lokk") har plass til ESP32-DevKit,
// nivåskifter, 5 V-inntak og sikring.
//
// LETT KONSTRUKSJON: ingen hele hyller eller vegger. Hver rad har to smale
// skinner per skuffkolonne (L ytterst, T mellom kolonnene) som skuffen glir
// på, en frontlist + LED-kanal foran (en lukket boks som bærer stripa) og en
// tynn tverrstang bak som også er bakstopp. Sidene er rammer med store
// vinduer, ryggen er åpen med kryss. Alt printes liggende på ryggen UTEN
// support: alle overheng er 45° eller korte broer mellom skinner/stag.
//
// LÅST AVSTAND: Skuffavstanden er et helt antall LED-er. Med led_per_m = 60
// er LED-avstanden 16,667 mm, og med led_per_skuff = 3 blir skuffavstanden
// 50 mm. Midt-LED-en står da rett over midten av skuffen, også over
// modulskjøtene, fordi modulbredden alltid er et helt antall skuffer.
//
// Materiale: sort PETG for alt, unntatt diffusoren (natur/hvit PETG,
// eller bakepapir/opal plast i sporet).
//
// VIKTIG: Mål hylla (og Raaco-skapet) før du printer (se
// tools/skjoldlab3d/README.md og tools/skjoldlab-led/README.md).
//
// Koordinater: X = bredde (venstre -> høyre), Y = dybde (front y = 0 -> bak),
// Z = høyde. Rad 1 er øverst og skuff 1 til venstre, som i Skjold Lab.
//
//   openscad -o skuff.stl -D 'del="skuff"' skjoldlab_ledvegg.scad
//   openscad -o modul_x0_y0.stl -D 'del="modul"' -D modul_x=0 -D modul_y=0 skjoldlab_ledvegg.scad
//   openscad -o oversikt.png -D 'del="oversikt"' skjoldlab_ledvegg.scad
// Konsollen skriver én linje per modul (SKJOLDLAB-MODUL), per øvrig del
// (SKJOLDLAB-DEL) og skuffnettet (SKJOLDLAB-NETT); eksporter.sh leser dem.
// Alle printdeler legges ut ferdig orientert for print (ingen support).
// =====================================================================

/* [Variant og del] */
// Hele hylla som ett skap med LED, eller LED-vegg rundt Raaco
variant = "hele_hylla"; // [hele_hylla, rundt_raaco]
// Hvilken del som vises/eksporteres
del = "oversikt"; // [oversikt, vegg, modul, topp_modul, skuff, skuffplate, skillevegg, skilleplate, skuff_2x1, skuff_1x2, skuff_2x2, skuffplate_2x1, skuffplate_1x2, skuffplate_2x2, skilleplate_2x1, skilleplate_1x2, skilleplate_2x2, maske, diffusor, lask, lask4, raaco_skinne, raaco_klips, raaco_klipsplate, elboks, elboks_lokk]
// Kolonne av moduler (0 = venstre) – modul, topp_modul, maske, diffusor
modul_x = 0;
// Etasje av moduler (0 = nederst) – modul, topp_modul
modul_y = 0;
// Seksjon for maske/diffusor (hele og side = hovedveggen, topp = toppveggen over Raaco)
seksjon = "hele"; // [hele, side, topp]
// Vis skuffer i oversikten
vis_skuffer = true;

/* [Hylla og Raaco (mål selv!)] */
hylle_bredde = 560;
hylle_hoyde = 760;
hylle_dybde = 320;
raaco_bredde = 300;
raaco_hoyde = 552;
raaco_dybde = 150;
raaco_side = "venstre"; // [venstre, hoyre]
// Luft mot hyllekanter og mellom seksjonene
klaring = 3;

/* [LED-stripe] */
// LED-er per meter (60 -> 16,667 mm)
led_per_m = 60; // [30, 60, 96, 144]
// LED-er per skuff: 3 -> 50 mm skuffavstand, 4 -> 66,7 mm
led_per_skuff = 3;
// Stripebredde
led_bredde = 10; // [10, 12]
// Tykkelse på stripa med LED (bar stripe ca. 2, silikonkappe ca. 3)
led_tykk = 2.0;
// Avstand fra bakkant av diffusorsporet til LED-ene (mer = jevnere lys)
led_avstand = 5;

/* [LED-vegg] */
// Hele hylla: overstyr antall (0 = auto ut fra hylla)
kolonner_hele = 0;
rader_hele = 0;
// Rundt Raaco: lag sideveggen ved siden av Raaco og toppveggen over Raaco
lag_side = true;
lag_topp = true;
// Hele hylla: en egen modulkolonne helt til venstre med store skuffer (antall skuffkolonner, partall). 0 = ingen
venstre_kolonner = 4;
// Hele hylla: skuffer som er 2 brede og 2 høye, i venstre kolonne nedenfra. 0 = ingen
store_skuffer = 10;
// Hele hylla: skuffer som er 2 brede og 1 høy. Først i venstre kolonne over de store, så i radene øverst til høyre. 0 = ingen
brede_skuffer = 10;
// Radhøyde uten LED-kanal: gulv + skuffåpning (ca. 45)
rad_hoyde = 45;
// Høyde på LED-kanalen over hver rad (0 = auto: led_bredde + 3)
kanal_h = 0;
// Rundt Raaco: overstyr antall (0 = auto ut fra plassen)
kolonner_side = 0;
rader_side = 0;
kolonner_topp = 0;
rader_topp = 0;
// Maks skuffer i bredden og rader i høyden per modul (mindre moduler = lettere, raskere og mindre skjevhet)
modul_kolonner_maks = 3;
modul_rader_maks = 3;
// Rammedybde (0 = auto: hylla eller dybde_maks, det minste)
lv_dybde = 0;
// Maks rammedybde. 165 gir skuff 156 mm (164 med grep, som Raaco). 0 = byggehoyde - 10 (240 mm, ca. 1,5 x filament i rammene)
dybde_maks = 165;
// Sideramme. To moduler inntil hverandre gir 2 x vegg_t, som er det samme som styrekanten på skinnene mellom kolonnene.
vegg_t = 1.6;
// Gulvnivå: overkant skinner og frontlist ligger hylle_t over raden
hylle_t = 2.0;
tak_t = 1.2;
// Ryggrammen (kryss og lister bak)
bakvegg = 2.0;
// Rom bak skuffene til skrueboss, bolter og mutter
bak_rom = 7;

/* [Lett ramme] */
// Skinne: flensbredde per side (bærer skuffen), tykkelse og styrekant over flensen
flens_b = 4.5;
flens_t = 1.6;
skinne_h = 3;
// Midtskinne under brede skuffer (legges inn når broen i printen ville blitt lengre enn bro_maks)
midt_b = 6;
bro_maks = 55;
// Frontlist (gulvet foran, lukker LED-kanalen under) og LED-veggen i kanalen
list_t = 1.2;
led_vegg_t = 1.2;
// Bakstopp: høyde over skinna
bakstopp_h = 4;
// Skråstag foran mellom kolonnene (fra skinna opp til taket)
stolpe_t = 2.0;
// Ryggkryss og lister: bredde
stag_b = 6;
// Minste materiale foran vinduene i siderammene
vindu_kant = 4;

/* [Skuff] */
skuff_vegg = 1.2;
skuff_bunn = 1.0;
skuff_front = 1.6;
// Avrundet grep foran (hult skall): hvor langt det stikker ut, bredde, høyde og gods
grep_ut = 8;
grep_b = 30;
grep_h = 16;
grep_t = 1.2;
etikett_h = 10;
etikett_dybde = 0.6;
spor_posisjoner = [1/3, 1/2, 2/3];
skillevegg_t = 1.2;
// Akrylfront: spor bak fronten til en plate (plexiglass) og et vindu over grepet, åpent oppover
akryl = true;
// Platetykkelse (Clas Ohlson 34-1359: 2 mm)
akryl_t = 2.0;
// Hvor langt platen går inn bak vinduskanten på hver side og nede
akryl_kant = 2.5;
// Stoppleppe bak (Raaco: 40 mm skuff, 42 mm med leppe)
stopp_h = 2;
// Luft over leppa
luft_over = 1;

/* [Lysvindu og diffusor] */
// Sporbredde foran i kanalen (maske + diffusor)
spor_b = 2.4;
ribbe_t = 1.0;
ribbe_h = 1.5;
// Vindu i masken over hver skuff (0 = auto, ca. én LED)
vindu_b = 0;
maske_t = 1.2;
diffusor_t = 0.8;

/* [Raaco-skinne] */
raaco_rader = 12;
raaco_kolonner = 5;
// Radavstand (0 = raaco_hoyde / raaco_rader = 46)
raaco_rad_pitch = 0;
// Skuffhøyde foran og med leppe bak
raaco_skuff_h = 40;
raaco_leppe_h = 42;
// Fri spalte mellom radene foran (0 = pitch - leppe = 4). MÅL DENNE!
raaco_spalte = 0;
// Synlig bredde på Raaco-sideveggen foran (der klipsen limes)
raaco_sidevegg_b = 8;
// Luft over og under skinna
raaco_luft = 0.5;
klips_t = 2.4;
// Plass til ledninger ytterst i hver ende
kabel_b = 3;

/* [Elektronikkboks] */
// Hullkort som ESP32 og 74AHCT125 sitter på
pcb = [70, 50, 1.6];
pcb_hull = [66, 46];
boks_indre = [110, 80, 38];
boks_vegg = 2.0;
// DC-kontakt 5,5/2,1 for panel, og sikringsholder 5x20 for panel
dc_hull_d = 11.5;
sikring_hull_d = 12.5;
// Kabelhull ut til stripene
kabel_hull_d = 7;
kabel_antall = 2;
// USB-luke til ESP32: bredde, høyde, senter fra venstre, høyde over bunn
usb_luke = [14, 9, 40, 16];

/* [Printer og toleranser] */
byggeplate = 256;
plate_margin = 10;
byggehoyde = 250;
toleranse = 0.4;
bolt_hull = 3.4;
skrue_kjerne = 2.6;
lask_t = 3;

/* [Skjult] */
e = 0.01;
$fn = 40;

// ---------------------------------------------------------------------
// Avledede mål
// ---------------------------------------------------------------------
hel = variant == "hele_hylla";
plass = byggeplate - plate_margin;                       // 246
dmaks = dybde_maks > 0 ? dybde_maks : byggehoyde - 10;    // 165
pled = 1000 / led_per_m;                                  // 16,667
P = led_per_skuff * pled;                                 // 50 (skuffavstand)
kh = kanal_h > 0 ? kanal_h : led_bredde + 3;              // 13
Pr = rad_hoyde + kh;                                      // 58 (radavstand)
aapning = rad_hoyde - hylle_t;                            // 43
skuff_h = aapning - stopp_h - luft_over;                  // 40
D = lv_dybde > 0 ? lv_dybde : min(hylle_dybde - klaring, dmaks); // 165
skuff_d = min(D - bakvegg - bak_rom, plass - grep_ut);    // 156
S = P - 2 * vegg_t;                                       // 46,8 (åpning)
skuff_b = S - 2 * toleranse;                              // 46,0
// Skuff nk kolonner bred og nf rader høy (1 x 1 = 46 x 40, 2 x 2 = 96 x 98)
function skuff_bredde(nk) = nk * P - 2 * vegg_t - 2 * toleranse;
function skuff_hoyde(nf) = nf * Pr - kh - hylle_t - stopp_h - luft_over;
// Akryl: spor (platetykkelse + toleranse) bak fronten, holdekant bak sporet, vindu fra over grepet og opp
ak_spor = akryl_t + toleranse;                            // 2,4
ak_hold = 1.2;
ak_zw = grep_h + 2;                                       // 18 underkant vindu
ak_zs = ak_zw - akryl_kant;                               // 15,5 bunnen i sporet
function akryl_b(nk) = skuff_bredde(nk) - 2 * skuff_vegg - 0.6;
function akryl_h(nf) = skuff_hoyde(nf) - ak_zs - 0.5;
// Kanalen (snitt): ribber med 45° bakside, sporet mellom dem, LED-veggen bak
spor_foran = ribbe_t + ribbe_h;                           // 2,5 forkant av sporet (ved roten)
spor_bak = spor_foran + spor_b;                           // 4,9 bakkant av sporet
kanal_d = spor_bak + led_avstand + led_tykk;              // 11,9 forkant av LED-veggen
led_bak = kanal_d + led_vegg_t;                           // 13,1
fl_d = led_bak + 0.5;                                     // 13,6 frontlista (lukker kanalen)
tak_d = led_bak + 1.5;                                    // 14,6 taket over skuffåpningen
zt_rel = rad_hoyde + tak_t;                               // 46,2 overkant tak
zT_rel = Pr + hylle_t - list_t;                           // 58,8 underkant frontlista i raden over
kanal_fri = zT_rel - zt_rel;                              // 12,6 fri høyde i kanalen
tak_d_topp = led_bak + 2.7 + kanal_fri;                   // 28,4 taket i øverste rad (bærer skråstaget)
innsats_h = kanal_fri - toleranse;                        // maske/diffusor
vb = vindu_b > 0 ? vindu_b : min(14, P - 8);
led_odde = led_per_skuff % 2 == 1;
led_offset = led_odde ? pled / 2 : pled;                  // første LED fra venstre kant
function led_antall(K) = led_odde ? K * led_per_skuff : K * led_per_skuff - 1;
function n_midt(s) = max(0, ceil((s - 2 * flens_b) / bro_maks) - 1);

kpm_maks = max(1, min(modul_kolonner_maks, floor(plass / P)));
rpm_maks = max(1, min(modul_rader_maks, floor((plass - hylle_t - ribbe_h) / Pr)));
function deling(n, m, i) = floor(n / m) + (i < n % m ? 1 : 0);
function sum_deling(n, m, i) = i <= 0 ? 0 : deling(n, m, i - 1) + sum_deling(n, m, i - 1);

// Hele hylla (variant "hele_hylla"), midt i hylla
h_Wav = hylle_bredde - 2 * klaring;                       // 554
h_Hav = hylle_hoyde - klaring;                            // 757
h_K = kolonner_hele > 0 ? kolonner_hele : floor(h_Wav / P);          // 11
// Høyden i enkeltrader (rader_hele teller enkeltrader; en dobbel rad er 2)
h_U = rader_hele > 0 ? rader_hele : floor((h_Hav - hylle_t) / Pr);   // 13
h_W = h_K * P;                                            // 550
h_H = h_U * Pr + hylle_t;                                 // 756
h_x0 = (hylle_bredde - h_W) / 2;                          // 5
h_ny = max(1, ceil(h_U / rpm_maks));                      // 5 etasjer (3/3/3/2/2 rader nedenfra)
// Store skuffer: egen modulkolonne til venstre (vk skuffkolonner, vk/2 doble skuffer side om side).
// I hver etasje står de store (2 rader høye) nederst og brede/vanlige over. Resten av hylla er vanlige skuffer.
vk_on = hel && venstre_kolonner >= 2 && store_skuffer + brede_skuffer > 0;
vk = vk_on ? 2 * floor(venstre_kolonner / 2) : 0;          // 4
halv = max(1, vk / 2);                                    // 2 doble skuffer side om side
nxr = max(1, ceil((h_K - vk) / kpm_maks));                // 3 (3/2/2)
kw = vk_on ? concat([vk], [for (i = [0 : nxr - 1]) deling(h_K - vk, nxr, i)]) : [for (i = [0 : max(1, ceil(h_K / kpm_maks)) - 1]) deling(h_K, max(1, ceil(h_K / kpm_maks)), i)];
h_nx = len(kw);                                           // 4 (4/3/2/2)
function kw_for(i) = i <= 0 ? 0 : kw_for(i - 1) + kw[i - 1];
function et_u(j) = deling(h_U, h_ny, j);
function et_s(j) = sum_deling(h_U, h_ny, j);
// Venstre kolonne: store rader (2 høye) fylles nedenfra, så brede rader, så vanlige
function cap_b(j) = floor(et_u(j) / 2);
function cap_b_for(j) = j <= 0 ? 0 : cap_b_for(j - 1) + cap_b(j - 1);
NB = vk_on ? min(cap_b_for(h_ny), ceil(max(0, store_skuffer) / halv)) : 0;   // 5 store rader
function nb(j) = max(0, min(cap_b(j), NB - cap_b_for(j)));
function f1_for(j) = j <= 0 ? 0 : f1_for(j - 1) + et_u(j - 1) - 2 * nb(j - 1);
NWL = vk_on ? min(f1_for(h_ny), ceil(max(0, brede_skuffer) / halv)) : 0;       // 3 brede rader
mg_full = [for (p = [0 : 1 : halv - 1]) 2 * p + 1];
function venstre_rader(j) = concat(
    [for (b = [0 : 1 : nb(j) - 1]) [2 * b, 2, mg_full]],
    [for (t = [0 : 1 : et_u(j) - 2 * nb(j) - 1]) [2 * nb(j) + t, 1, f1_for(j) + t < NWL ? mg_full : []]]);
// Brede skuffer som ikke fikk plass til venstre: rader øverst i resten av hylla, fylt fra venstre
i0r = vk_on ? 1 : 0;
par_r = sum_liste([for (i = [i0r : h_nx - 1]) floor(kw[i] / 2)]);
n_br_r = hel ? min(par_r * h_U, max(0, brede_skuffer - NWL * halv)) : 0;
function par_for_r(i) = i <= i0r ? 0 : par_for_r(i - 1) + floor(kw[i - 1] / 2);
function brede_h(u, i) = let(q = h_U - 1 - u, n = n_br_r - q * par_r) max(0, min(floor(kw[i] / 2), n - par_for_r(i)));
// Radene i modul (i, j) nedenfra: [enhet fra bunnen av modulen, høyde i rader, lokale skjøter uten T-skinne]
function h_rader(i, j) = vk_on && i == 0 ? venstre_rader(j) :
    [for (t = [0 : et_u(j) - 1]) [t, 1, [for (p = [0 : 1 : brede_h(et_s(j) + t, i) - 1]) 2 * p + 1]]];
n22 = NB * halv;
n21 = NWL * halv + n_br_r;
n12 = 0;
// Rader (nedenfra) der venstre kolonne ikke har LED-kanal (midt i en stor skuff)
blinde = vk_on ? [for (j = [0 : h_ny - 1]) for (b = [0 : 1 : nb(j) - 1]) et_s(j) + 2 * b] : [];

// Rundt Raaco: plassering
rx0 = raaco_side == "venstre" ? 0 : hylle_bredde - raaco_bredde;
// Sideveggen (a)
s_Wav = hylle_bredde - raaco_bredde - 2 * klaring;        // 254
s_Hav = hylle_hoyde - klaring;                            // 757
s_K = kolonner_side > 0 ? kolonner_side : floor(s_Wav / P);          // 5
s_R = rader_side > 0 ? rader_side : floor((s_Hav - hylle_t) / Pr);   // 13
s_nx = max(1, ceil(s_K / kpm_maks));                      // 2
s_ny = max(1, ceil(s_R / rpm_maks));                      // 5
s_W = s_K * P;
s_H = s_R * Pr + hylle_t;
s_x0 = raaco_side == "venstre" ? raaco_bredde + klaring : hylle_bredde - raaco_bredde - klaring - s_W;
// Toppveggen (b), midt over Raaco
t_Wav = raaco_bredde - klaring;                           // 297
t_Hav = hylle_hoyde - klaring - raaco_hoyde;              // 205
t_K = kolonner_topp > 0 ? kolonner_topp : floor(t_Wav / P);          // 5
t_R = rader_topp > 0 ? rader_topp : floor((t_Hav - hylle_t) / Pr);   // 3
t_nx = max(1, ceil(t_K / kpm_maks));
t_ny = max(1, ceil(t_R / rpm_maks));
t_W = t_K * P;
t_H = t_R * Pr + hylle_t;
t_x0 = rx0 + (raaco_bredde - t_W) / 2;
lag_t = !hel && lag_topp;

// Hovedveggen: hele hylla, eller sideveggen ved Raaco
m_K = hel ? h_K : s_K;
m_R = hel ? h_U : s_R;
m_nx = hel ? h_nx : s_nx;
m_ny = hel ? h_ny : s_ny;
// Felles oppslag for hovedveggen (top = false) og toppveggen over Raaco (top = true)
function mod_k(top, i) = top ? deling(t_K, t_nx, i) : hel ? kw[i] : deling(m_K, m_nx, i);
function mod_x(top, i) = (top ? sum_deling(t_K, t_nx, i) : hel ? kw_for(i) : sum_deling(m_K, m_nx, i)) * P;
// Etasje j: [første rad nedenfra, antall rader] (i enkeltrader)
function mod_rows(top, j) = top ? [sum_deling(t_R, t_ny, j), deling(t_R, t_ny, j)] : [sum_deling(m_R, m_ny, j), deling(m_R, m_ny, j)];
function mod_rader(top, i, j) = !top && hel ? h_rader(i, j) : [for (t = [0 : mod_rows(top, j)[1] - 1]) [t, 1, []]];
function har(v, x) = len([for (a = v) if (a == x) 1]) > 0;
function bredder(k, mg) = [for (c = [0 : k - 1]) if (!har(mg, c)) (har(mg, c + 1) ? 2 : 1)];
function join(v, i = 0) = i >= len(v) ? "" : str(i > 0 ? "," : "", v[i], join(v, i + 1));
m_x0 = hel ? h_x0 : s_x0;
m_navn = hel ? "hele" : "side";
lag_m = hel || lag_side;

// Raaco
r_pitch = raaco_rad_pitch > 0 ? raaco_rad_pitch : raaco_hoyde / raaco_rader;   // 46
r_spalte = raaco_spalte > 0 ? raaco_spalte : r_pitch - raaco_leppe_h;           // 4
r_bund = 1.0;                                             // topplata i skinna
r_vegg = 1.2;
rs_h = r_bund + led_tykk;                                 // 3,0 skinnehøyde
rs_b = led_bredde + 0.4 + 2 * r_vegg;                     // 12,8 skinnedybde
rs_l = raaco_bredde - 2 * kabel_b;                        // 294
r_leds = floor(raaco_bredde / pled);                      // 18
klips_h = r_pitch - 0.4;                                  // klipsene stables

// ---------------------------------------------------------------------
// Kontroller
// ---------------------------------------------------------------------
assert(variant == "hele_hylla" || variant == "rundt_raaco", "variant må være \"hele_hylla\" eller \"rundt_raaco\".");
assert(raaco_side == "venstre" || raaco_side == "hoyre", "raaco_side må være \"venstre\" eller \"hoyre\".");
assert(seksjon == "hele" || seksjon == "side" || seksjon == "topp", "seksjon må være \"hele\", \"side\" eller \"topp\".");
assert(led_per_skuff >= 1 && led_per_skuff == floor(led_per_skuff), "led_per_skuff må være et helt tall >= 1.");
assert(P <= plass, "Skuffavstanden er større enn byggeplaten. Sett led_per_skuff lavere.");
assert(skuff_b >= 25, str("Skuffene blir bare ", skuff_b, " mm brede. Sett led_per_skuff høyere."));
assert(skuff_h >= 20, str("Skuffene blir bare ", skuff_h, " mm høye. Øk rad_hoyde."));
assert(kanal_fri >= led_bredde + 0.4, str("LED-kanalen (", kanal_fri, " mm fri høyde) er for lav for en ", led_bredde, " mm stripe. Øk kanal_h."));
assert(flens_t <= hylle_t && list_t <= hylle_t, "flens_t og list_t kan ikke være tykkere enn hylle_t.");
assert(D <= byggehoyde, str("Rammene printes liggende på ryggen, så dybden (", D, " mm) må være <= byggehoyde (", byggehoyde, " mm)."));
assert(skuff_d + grep_ut <= plass, "Skuffen får ikke plass på byggeplaten. Sett lv_dybde lavere.");
assert(skuff_d >= 60, "Skuffene blir for korte. Sjekk lv_dybde og bak_rom.");
assert(bak_rom >= 6, "bak_rom må være minst 6 mm (skrueboss bak skuffene).");
assert(D - bakvegg - bak_rom - 1 > tak_d_topp + 2 + 30, "Rammen er for grunn til vinduene i siderammene. Øk lv_dybde/dybde_maks.");
assert(rpm_maks >= 1, "Radavstanden er større enn byggeplaten.");
assert(rpm_maks * Pr + hylle_t <= plass && kpm_maks * P <= plass, "Modulene blir større enn byggeplaten. Sett modul_kolonner_maks/modul_rader_maks lavere.");
assert(!hel || h_K >= 1, str("For lite plass i hylla (", h_Wav, " mm) til én skuff på ", P, " mm."));
assert(!hel || h_U >= 1, "Hylla er for lav til én rad.");
assert(!vk_on || vk * P <= plass, str("Venstre kolonne (", vk * P, " mm) er bredere enn byggeplaten. Sett venstre_kolonner lavere."));
assert(!vk_on || vk < h_K, "venstre_kolonner må være mindre enn antall kolonner.");
assert(!vk_on || rpm_maks >= 2 || NB == 0, "Store skuffer er høyere enn modul_rader_maks tillater.");
assert(!akryl || skuff_h >= ak_zw + 8, "Skuffene er for lave til akrylvindu over grepet. Sett akryl = false eller øk rad_hoyde.");
assert(!hel || h_W <= h_Wav, str("Veggen (", h_W, " mm) er bredere enn hylla (", h_Wav, " mm). Sett kolonner_hele lavere."));
assert(!hel || h_H <= h_Hav, str("Veggen (", h_H, " mm) er høyere enn hylla (", h_Hav, " mm). Sett rader_hele lavere."));
assert(hel || raaco_hoyde + klaring <= hylle_hoyde, "Raaco-skapet er høyere enn hylla.");
assert(hel || !lag_side || s_K >= 1, str("For lite plass ved siden av Raaco (", s_Wav, " mm) til én skuff på ", P, " mm."));
assert(hel || !lag_side || s_W <= s_Wav, str("Sideveggen (", s_W, " mm) er bredere enn plassen (", s_Wav, " mm). Sett kolonner_side lavere."));
assert(hel || !lag_side || s_H <= s_Hav, str("Sideveggen (", s_H, " mm) er høyere enn hylla. Sett rader_side lavere."));
assert(hel || !lag_topp || t_R >= 1, str("Bare ", t_Hav, " mm over Raaco – for lite til én rad. Sett lag_topp = false."));
assert(hel || !lag_topp || t_W <= t_Wav, str("Toppveggen (", t_W, " mm) er bredere enn Raaco. Sett kolonner_topp lavere."));
assert(hel || !lag_topp || t_H <= t_Hav, str("Toppveggen (", t_H, " mm) er for høy. Sett rader_topp lavere."));
assert(hel || rs_h <= r_spalte - 2 * raaco_luft,
       str("Raaco-skinna (", rs_h, " mm) får ikke plass i spalten (", r_spalte, " mm) mellom radene. Mål raaco_spalte. ",
           "Er spalten mindre enn ", rs_h + 2 * raaco_luft, " mm, limer du stripa rett på rammen i stedet (se README)."));
assert((rs_l + rs_b) / sqrt(2) <= plass, "Raaco-skinna får ikke plass diagonalt på byggeplaten.");

// ---------------------------------------------------------------------
// Oversikt i konsollen
// ---------------------------------------------------------------------
echo(str("SKJOLDLAB-LED: variant ", variant, ", hylle ", hylle_bredde, " x ", hylle_dybde, " x ", hylle_hoyde, " mm (B x D x H)",
         hel ? "" : str(", Raaco ", raaco_bredde, " x ", raaco_dybde, " x ", raaco_hoyde, " mm til ", raaco_side)));
echo(str("SKJOLDLAB-LED: LED ", led_per_m, "/m = ", pled, " mm, ", led_per_skuff, " per skuff -> skuffavstand ", P, " mm, radavstand ", Pr,
         " mm (", rad_hoyde, " + kanal ", kh, ")"));
echo(str("SKJOLDLAB-LED: skuff ", skuff_b, " x ", skuff_d, " x ", skuff_h, " mm (B x D x H), ", skuff_d + grep_ut, " mm med grep, ",
         skuff_h + stopp_h, " mm med leppe bak, rammedybde ", D, " mm (printhøyde, liggende på ryggen)"));
if (hel) {
    echo(str("SKJOLDLAB-LED: hele hylla ", h_U, " rader x ", h_K, " kolonner", vk_on ? str(", store skuffer i de ", vk, " kolonnene til venstre") : "",
             ", ", h_W, " x ", D, " x ", h_H, " mm, x = ", h_x0));
    echo(str("SKJOLDLAB-LED: hele moduler ", h_nx, " x ", h_ny, " kolonner ", kw, " rader per etasje ", [for (j = [0 : h_ny - 1]) et_u(j)]));
}
if (!hel && lag_side) {
    echo(str("SKJOLDLAB-LED: sidevegg ", s_R, " rader x ", s_K, " kolonner = ", s_R * s_K, " skuffer, ", s_W, " x ", D, " x ", s_H, " mm, x = ", s_x0));
    echo(str("SKJOLDLAB-LED: side moduler ", s_nx, " x ", s_ny, " kolonner ", [for (i = [0 : s_nx - 1]) deling(s_K, s_nx, i)],
             " rader ", [for (j = [0 : s_ny - 1]) deling(s_R, s_ny, j)]));
}
if (lag_t) {
    echo(str("SKJOLDLAB-LED: toppvegg ", t_R, " rader x ", t_K, " kolonner = ", t_R * t_K, " skuffer, ", t_W, " x ", D, " x ", t_H, " mm, x = ", t_x0));
    echo(str("SKJOLDLAB-LED: topp moduler ", t_nx, " x ", t_ny, " kolonner ", [for (i = [0 : t_nx - 1]) deling(t_K, t_nx, i)]));
}
n_side = !hel && lag_side ? s_R * led_antall(s_K) : 0;
n_topp = lag_t ? t_R * led_antall(t_K) : 0;
n_raaco = hel ? 0 : raaco_rader * r_leds;
n_hele = hel ? h_U * led_antall(h_K) : 0;
n_led = n_raaco + n_side + n_topp + n_hele;
if (hel) {
    echo(str("SKJOLDLAB-LED: LED-er: ", n_hele, " (", h_U, " rader x ", led_antall(h_K), ", ca. ", ceil(n_hele * pled / 100) / 10, " m stripe)",
             len(blinde) > 0 ? str(", av dem ", len(blinde) * led_antall(vk), " blinde") : ""));
    if (len(blinde) > 0)
        echo(str("SKJOLDLAB-LED: blinde rader (ingen kanal i venstre kolonne, midt i en stor skuff): rad ", join([for (u = blinde) h_U - u]),
                 ". Alle rader går fra venstre mot høyre (layout «samme retning»). I disse radene starter stripa ved kolonne ", vk + 1,
                 ", og ", led_antall(vk), " blinde LED-er legges skjult før den (se README)."));
    echo(str("SKJOLDLAB-LED: Skjold Lab: «Sorteringsskap (LED)» ", h_U, " x ", h_K, len(blinde) > 0 ? " layout samme retning" : "", " start 0, drawerPitchMm ", P, ", firstDrawerXmm ", P / 2, ", ",
             led_antall(h_K), " per rad, offsetMm ", led_offset));
} else {
    echo(str("SKJOLDLAB-LED: Raaco-skinne ", rs_l, " x ", rs_b, " x ", rs_h, " mm, ", raaco_rader, " stk + ", 2 * raaco_rader,
             " klips, pitch ", r_pitch, " mm, spalte ", r_spalte, " mm, ", r_leds, " LED-er per rad"));
    echo(str("SKJOLDLAB-LED: LED-er: Raaco ", n_raaco, ", sidevegg ", n_side, ", toppvegg ", n_topp, ", sum ", n_led,
             " (ca. ", ceil(n_led * pled / 100) / 10, " m stripe)"));
    echo(str("SKJOLDLAB-LED: Skjold Lab: «Hovedskap» start 0, drawerPitchMm ", raaco_bredde / raaco_kolonner, ", firstDrawerXmm ", raaco_bredde / raaco_kolonner / 2,
             ", ", r_leds, " per rad, offsetMm ", pled / 2,
             lag_t ? str("; «LED-vegg topp» ", t_R, " x ", t_K, " start ", n_raaco, ", drawerPitchMm ", P, ", firstDrawerXmm ", P / 2, ", ",
                         led_antall(t_K), " per rad, offsetMm ", led_offset) : "",
             lag_side ? str("; «LED-vegg side» ", s_R, " x ", s_K, " start ", n_raaco + n_topp, ", drawerPitchMm ", P, ", firstDrawerXmm ", P / 2, ", ",
                            led_antall(s_K), " per rad, offsetMm ", led_offset) : ""));
}
// Rekkefølge på stripene: hele hylla = én kjede (rad 1 øverst, start til venstre, serpentine).
// Rundt Raaco: utgang A = Raaco, utgang B = toppveggen og så sideveggen.

// ---------------------------------------------------------------------
// Plan for print og montering (leses av eksporter.sh og Skjold Lab)
// ---------------------------------------------------------------------
// Seksjon: [navn, del, K, R, nx, ny, x0 (fra venstre i hylla), z0 (fra gulvet)]
seksjoner = concat(
    lag_m ? [[m_navn, "modul", m_K, m_R, m_nx, m_ny, m_x0, 0]] : [],
    lag_t ? [["topp", "topp_modul", t_K, t_R, t_nx, t_ny, t_x0, raaco_hoyde]] : []);
// Moduler sortert nedenfra og fra venstre: [nøkkel, del, mx, my, x, y, b, h, rader, kolonner, seksjon]
function qs(v) = len(v) <= 1 ? v : let(p = v[floor(len(v) / 2)][0])
    concat(qs([for (a = v) if (a[0] < p) a]), [for (a = v) if (a[0] == p) a], qs([for (a = v) if (a[0] > p) a]));
plan = qs([for (s = seksjoner) for (j = [0 : s[5] - 1]) for (i = [0 : s[4] - 1])
    let(top = s[0] == "topp", et = mod_rows(top, j), k = mod_k(top, i), n = len(mod_rader(top, i, j)),
        x = s[6] + mod_x(top, i), y = s[7] + et[0] * Pr)
    [round(y * 10) * 100000 + round(x * 10), s[1], i, j, x, y, k * P,
     et[1] * Pr + (j == s[5] - 1 ? hylle_t : 0), n, k, s[0]]]);
if (len(plan) > 0) for (q = [0 : len(plan) - 1]) let(m = plan[q])
    echo(str("SKJOLDLAB-MODUL: nr=", q + 1, " del=", m[1], " modul_x=", m[2], " modul_y=", m[3], " x=", m[4], " y=", m[5],
             " b=", m[6], " h=", m[7], " rader=", m[8], " kolonner=", m[9], " seksjon=", m[10]));
for (s = seksjoner) let(top = s[0] == "topp") {
    echo(str("SKJOLDLAB-NETT: kolonner=", s[2], " rader=", s[3], " skuffavstand=", P, " radavstand=", Pr,
             " x0=", s[6] + P / 2, " y0=", s[7] + (s[3] - 1) * Pr + hylle_t + skuff_h / 2,
             " led_per_rad=", led_antall(s[2]), " leds=", s[3] * led_antall(s[2]), " seksjon=", s[0]));
    // Én linje per skuffrad i hver modul: rad i Skjold Lab (øverste rad skuffen dekker, 1 = øverst), underkant, høyde, LED-høyde og bredder
    for (j = [0 : s[5] - 1], i = [0 : s[4] - 1]) let(et = mod_rows(top, j), k = mod_k(top, i)) for (rr = mod_rader(top, i, j))
        echo(str("SKJOLDLAB-RAD: seksjon=", s[0], " rad=", s[3] - (et[0] + rr[0] + rr[1] - 1), " x0=", s[6] + mod_x(top, i),
                 " y=", s[7] + (et[0] + rr[0]) * Pr + hylle_t, " h=", skuff_hoyde(rr[1]), " led_y=", s[7] + (et[0] + rr[0] + rr[1]) * Pr - kh / 2,
                 " skuffavstand=", P, " skuffer=", join(bredder(k, rr[2]))));
}
// Skuffer per type: 1 x 1, 2 x 1 (brede), 1 x 2 (høye smale i de doble radene) og 2 x 2
n_celler = sum_liste([for (s = seksjoner) s[2] * s[3]]);
n11 = n_celler - 4 * n22 - 2 * n21 - 2 * n12;
n_skuffer = n11 + n21 + n12 + n22;
echo(str("SKJOLDLAB-SKUFFER: 1x1=", n11, " 2x1=", n21, " 1x2=", n12, " 2x2=", n22, " sum=", n_skuffer));
function sum_liste(v, i = 0) = i >= len(v) ? 0 : v[i] + sum_liste(v, i + 1);
function skp_n(nk) = max(1, floor((plass + 5) / (skuff_bredde(nk) + 5))) * max(1, floor((plass + 5) / (skuff_d + grep_ut + 5)));
function skv_b(nk) = skuff_bredde(nk) - 2 * skuff_vegg - toleranse;
function skv_h(nf) = skuff_hoyde(nf) - skuff_bunn - 1;
function skl_n(nk, nf) = max(1, floor((plass + 4) / (skv_b(nk) + 4))) * max(1, floor((plass + 4) / (skv_h(nf) + 4)));
skp_n = skp_n(1);
skl_n = skl_n(1, 1);
// Akryl: plater per skufftype (B x H), og hvor mange som går på en plate på 300 x 200 mm med 1 mm sagsnitt
TYPER = [["2x1", 2, 1, n21], ["1x2", 1, 2, n12], ["2x2", 2, 2, n22]];
function ak_per_ark(nk, nf) = max(floor(300 / (akryl_b(nk) + 1)) * floor(200 / (akryl_h(nf) + 1)),
                                  floor(200 / (akryl_b(nk) + 1)) * floor(300 / (akryl_h(nf) + 1)));
if (akryl) {
    for (t = concat([["1x1", 1, 1, n11]], TYPER)) if (t[3] > 0)
        echo(str("SKJOLDLAB-AKRYL: type=", t[0], " antall=", t[3], " mm=", akryl_b(t[1]), "x", akryl_h(t[2]),
                 " per_ark=", ak_per_ark(t[1], t[2]), " ark=", ceil(t[3] / ak_per_ark(t[1], t[2]))));
    echo(str("SKJOLDLAB-AKRYL: tykkelse=", akryl_t, " areal_cm2=",
             round(sum_liste([for (t = concat([["1x1", 1, 1, n11]], TYPER)) t[3] * akryl_b(t[1]) * akryl_h(t[2])]) / 100)));
}
n_lask = sum_liste([for (s = seksjoner) 2 * (s[5] - 1)]);
n_lask4 = sum_liste([for (s = seksjoner) (s[4] - 1) * (s[5] - 1)]);
module del_linje(navn, d, antall, gruppe, ekstra = "") {
    echo(str("SKJOLDLAB-DEL: navn=", navn, " del=", d, " antall=", antall, " gruppe=", gruppe, ekstra));
}
del_linje("skuff", "skuff", 1, "prove");
del_linje("skillevegg", "skillevegg", 1, "prove");
del_linje("skuffplate", "skuffplate", ceil(max(0, n11 - 1) / skp_n), "skuffer", str(" per_plate=", skp_n));
del_linje("skilleplate", "skilleplate", ceil(n11 / skl_n), "skuffer", str(" per_plate=", skl_n));
// Store, brede og høye skuffer: hele plater + resten enkeltvis
for (t = TYPER) if (t[3] > 0) let(pp = skp_n(t[1]), hele = floor(t[3] / pp), rest = t[3] - hele * pp) {
    if (hele > 0) del_linje(str("skuffplate_", t[0]), str("skuffplate_", t[0]), hele, "skuffer", str(" per_plate=", pp));
    if (rest > 0) del_linje(str("skuff_", t[0]), str("skuff_", t[0]), rest, "skuffer");
    del_linje(str("skilleplate_", t[0]), str("skilleplate_", t[0]), ceil(t[3] / skl_n(t[1], t[2])), "skuffer", str(" per_plate=", skl_n(t[1], t[2])));
}
for (s = seksjoner) for (i = [0 : s[4] - 1]) {
    del_linje(str("maske_", s[0], "_x", i), "maske", s[3], "led", str(" modul_x=", i, " seksjon=", s[0]));
    del_linje(str("diffusor_", s[0], "_x", i), "diffusor", s[3], "led", str(" modul_x=", i, " seksjon=", s[0]));
}
if (!hel) {
    del_linje("raaco_skinne", "raaco_skinne", raaco_rader, "led");
    del_linje("raaco_klips", "raaco_klips", 1, "prove");
    del_linje("raaco_klipsplate", "raaco_klipsplate", 1, "led", str(" per_plate=", 2 * raaco_rader - 1));
}
del_linje("lask", "lask", n_lask, "beslag");
del_linje("lask4", "lask4", n_lask4, "beslag");
del_linje("elboks", "elboks", 1, "elektronikk");
del_linje("elboks_lokk", "elboks_lokk", 1, "elektronikk");

// ---------------------------------------------------------------------
// Hjelpere
// ---------------------------------------------------------------------
// Dråpeformet hull (spiss mot -Y i 2D)
module draape2d(d) {
    r = d / 2;
    union() {
        circle(r = r);
        polygon([[-r * sqrt(0.5), -r * sqrt(0.5)], [r * sqrt(0.5), -r * sqrt(0.5)], [0, -r * sqrt(2)]]);
    }
}
// Langs +X, spiss mot fronten (-Y): for rammer som printes på ryggen
module draape_x(d, h) { rotate([0, 90, 0]) linear_extrude(h) draape2d(d); }
// Langs +X, spiss opp (+Z): for deler som printes stående
module draape_x_opp(d, h) { rotate([0, 90, 0]) linear_extrude(h) rotate([0, 0, -90]) draape2d(d); }
// Langs +Y, spiss opp (+Z)
module draape_y_opp(d, h) { rotate([-90, 0, 0]) linear_extrude(h) draape2d(d); }
// 2D-profil i YZ ([y, z]) ekstrudert langs X fra x = 0 til W
module langs_x(W) { rotate([90, 0, 90]) linear_extrude(W) children(); }
// Ribbe opp fra flaten zs / ned fra flaten zs (spor for maske og diffusor).
// Loddrett forside, 45° bakside: bakkanten er undersiden når rammen ligger på ryggen.
module ribbe_opp2d(ya, zs) { polygon([[ya, zs - e], [ya + ribbe_t + ribbe_h, zs - e], [ya + ribbe_t, zs + ribbe_h], [ya, zs + ribbe_h]]); }
module ribbe_ned2d(ya, zs) { polygon([[ya, zs + e], [ya + ribbe_t + ribbe_h, zs + e], [ya + ribbe_t, zs - ribbe_h], [ya, zs - ribbe_h]]); }
// Vindu i en sideramme (YZ): spiss 45° foran (taket når rammen ligger på ryggen), flat bak
module vindu2d(y0, y1, za, zb) {
    hm = (zb - za) / 2;
    if (zb - za >= 4 && y1 - y0 > hm + 2)
        polygon([[y0, za + hm], [y0 + hm, za], [y1, za], [y1, zb], [y0 + hm, zb]]);
}

// ---------------------------------------------------------------------
// Skuff (origo: front-venstre-bunn av skuffkroppen, front mot -Y)
// ---------------------------------------------------------------------
module grep_form(gb, r, ut, gh) {
    hull() {
        linear_extrude(max(1, gh - ut)) hull() {
            translate([r, -ut + r]) circle(r = r);
            translate([gb - r, -ut + r]) circle(r = r);
            translate([0, -e]) square([gb, e]);
        }
        translate([0, -e, gh - e]) cube([gb, e, e]);
    }
}
module lv_skuff(nk = 1, nf = 1) {
    w = skuff_bredde(nk); d = skuff_d; h = skuff_hoyde(nf); t = skuff_vegg; s = stopp_h;
    ribbe = 1.0;
    gap = skillevegg_t + toleranse;
    yi = akryl ? skuff_front + ak_spor + ak_hold : skuff_front;   // forkant av rommet
    L = d - yi - t;
    gb = min(grep_b, w - 6);
    r = min(grep_ut, gb / 2);
    eh = min(etikett_h, h - grep_h - 4);
    eb = w - 8;
    union() {
        difference() {
            union() {
                cube([w, d, h]);
                // Avrundet grep foran (som på bildet): hult skall, åpent nedover, 45° tak -> ingen support
                translate([(w - gb) / 2, 0, 0]) difference() {
                    grep_form(gb, r, grep_ut, grep_h);
                    intersection() {
                        translate([grep_t, 0, -e]) grep_form(gb - 2 * grep_t, r - grep_t, grep_ut - grep_t, grep_h - grep_t * sqrt(2));
                        translate([-1, -grep_ut - 1, -1]) cube([gb + 2, grep_ut + 1, grep_h + 2]);
                    }
                }
            }
            // Innvendig rom (med akryl er de første ak_spor mm sporet til platen)
            translate([t, skuff_front, skuff_bunn]) cube([w - 2 * t, d - skuff_front - t, h]);
            // Akryl: vindu i fronten fra over grepet og helt opp (ingen bro i printen), ellers etikettfelt øverst
            if (akryl) translate([t + akryl_kant, -e, ak_zw]) cube([w - 2 * t - 2 * akryl_kant, skuff_front + 2 * e, h]);
            else translate([(w - eb) / 2, -e, h - 2 - eh]) cube([eb, etikett_dybde + e, eh]);
        }
        // Akryl: sokkel under sporet og holdekanter bak platen på begge sider. Platen skyves ned ovenfra.
        if (akryl) {
            translate([t - e, skuff_front - e, skuff_bunn - e]) cube([w - 2 * t + 2 * e, ak_spor + ak_hold + e, ak_zs - skuff_bunn + e]);
            for (x = [t - e, w - t - akryl_kant]) translate([x, skuff_front + ak_spor, ak_zs - e]) cube([akryl_kant + e, ak_hold, h - ak_zs + e]);
        }
        // Stoppleppe bak med 45° forside (og 45° underside innover): hekter seg under stoppkanten i rammen
        translate([t - e, 0, 0]) langs_x(w - 2 * t + 2 * e)
            polygon([[d - t + e, h - s], [d - t - s, h], [d - t, h + s], [d, h + s], [d, h - s]]);
        // Spor for skillevegger: ribbepar på begge sidevegger
        for (p = spor_posisjoner) {
            yc = yi + p * L;
            for (dy = [-(gap / 2 + ribbe), gap / 2]) {
                translate([t - e, yc + dy, skuff_bunn - e]) cube([ribbe + e, ribbe, h - skuff_bunn - 1.5]);
                translate([w - t - ribbe, yc + dy, skuff_bunn - e]) cube([ribbe + e, ribbe, h - skuff_bunn - 1.5]);
            }
        }
    }
}

// Skillevegg, liggende for print
module lv_skillevegg(nk = 1, nf = 1) {
    b = skv_b(nk); hh = skv_h(nf);
    difference() {
        cube([b, hh, skillevegg_t]);
        translate([b / 2, hh + 2, -e]) cylinder(r = 5, h = skillevegg_t + 2 * e);
    }
}

// ---------------------------------------------------------------------
// Rammemodul – lett utgave (origo: front-venstre-bunn, front mot -Y)
// k = kolonner, n = rader, bunn = nederste modul i seksjonen,
// topp = øverste modul (får lokk), vs/hs = nabo til venstre/høyre
//
// Per rad (z0 = r * Pr):
//   skinner langs dybden (L ytterst, T mellom kolonnene) med overkant z0 + hylle_t
//   frontlist foran (lukker LED-kanalen under, ribber ned holder masken)
//   tak + stoppkant + ribber + LED-vegg: en lukket boks som er tverrlista foran
//   skråstag 45° fra T-skinna opp til taket (bærer taket i printen)
//   bakstopp: tynn tverrstang bak
// Øverste rad: skråstag bak LED-veggen (45°), så overkanten ikke henger fritt.
// Rygg: lister oppe og nede + kryss. Sider: rammer med vinduer (45° spiss foran).
// ---------------------------------------------------------------------
module lv_skinner(W, k, z0, mg = []) {
    zf = z0 + hylle_t - flens_t;
    // Kantskinner (L): sideramma er styrekanten
    translate([vegg_t - e, 0, zf]) cube([flens_b + e, D, flens_t]);
    translate([W - vegg_t - flens_b, 0, zf]) cube([flens_b + e, D, flens_t]);
    // T-skinner mellom kolonnene: styrekanten er 2 x vegg_t, som en modulskjøt (ikke under en dobbel skuff)
    if (k > 1) for (c = [1 : k - 1]) if (!har(mg, c)) {
        translate([c * P - vegg_t - flens_b, 0, zf]) cube([2 * (vegg_t + flens_b), D, flens_t]);
        translate([c * P - vegg_t, 0, zf]) cube([2 * vegg_t, D, flens_t + skinne_h]);
    }
    // Midtskinner under brede skuffer (en dobbel skuff får én midt under, der T-skinna ellers sto)
    for (c = [0 : k - 1]) if (!har(mg, c)) {
        Sx = (har(mg, c + 1) ? 2 : 1) * P - 2 * vegg_t;
        nm = n_midt(Sx);
        if (nm > 0) for (i = [1 : nm])
            translate([c * P + vegg_t + flens_b + i * (Sx - 2 * flens_b) / (nm + 1) - midt_b / 2, 0, zf]) cube([midt_b, D, flens_t]);
    }
}

module lv_rygg(W, Hm, bx, bz) {
    b = stag_b;
    translate([0, D - bakvegg, 0]) {
        cube([W, bakvegg, b]);
        translate([0, 0, Hm - b]) cube([W, bakvegg, b]);
        for (s = [0, 1]) hull() {
            translate([s == 0 ? 0 : W - b, 0, 0]) cube([b, bakvegg, b]);
            translate([s == 0 ? W - b : 0, 0, Hm - b]) cube([b, bakvegg, b]);
        }
        // Puter rundt skruebossene
        for (x = bx, z = bz) translate([x - 7, 0, z - 7]) cube([14, bakvegg, 14]);
    }
}

// rf = høyde per rad (1 = vanlig, 2 = dobbel), mg = lokale skjøter uten T-skinne per rad
function zsum(rf, r) = r <= 0 ? 0 : zsum(rf, r - 1) + rf[r - 1] * Pr;
module lv_modul(k, n, bunn, topp, vs, hs, rf = [], mg = []) {
    rfx = [for (r = [0 : n - 1]) len(rf) > r ? rf[r] : 1];
    mgx = [for (r = [0 : n - 1]) len(mg) > r ? mg[r] : []];
    W = k * P;
    Hr = zsum(rfx, n);
    Hm = Hr + (topp ? hylle_t : 0);
    bx = [8, W - 8];
    bz = [8, Hr - 8];
    ys = skuff_d + 0.3;                    // bakstopp
    y1 = D - bakvegg - bak_rom - 1;        // bakkant av vinduene
    zlokk = Hr + hylle_t - list_t;
    difference() {
        union() {
            // Siderammer
            for (x = [0, W - vegg_t]) translate([x, 0, 0]) cube([vegg_t, D, Hm]);
            for (r = [0 : n - 1]) {
                f = rfx[r];
                z0 = zsum(rfx, r);
                zc = z0 + f * Pr - kh;         // underkant tak = overkant skuffåpning
                zt = zc + tak_t;               // overkant tak
                sist = r == n - 1;
                zT = sist && !topp ? z0 + f * Pr : z0 + f * Pr + hylle_t - list_t;   // overkant LED-veggen
                td = sist ? tak_d_topp : tak_d;
                zr = z0 + hylle_t;
                Ls = zt - zr;
                lv_skinner(W, k, z0, mgx[r]);
                // Frontlist (gulvet foran). I nederste rad i en modul griper ribbene ned i kanalen i modulen under og låser fronten.
                translate([0, 0, z0 + hylle_t - list_t]) cube([W, fl_d, list_t]);
                if (!(bunn && r == 0)) langs_x(W) for (ya = [0, spor_bak]) ribbe_ned2d(ya, z0 + hylle_t - list_t);
                // Bakstopp (tynn tverrstang)
                translate([vegg_t - e, ys, z0 + hylle_t - flens_t]) cube([W - 2 * vegg_t + 2 * e, flens_t, flens_t + bakstopp_h]);
                // Tak over skuffåpningen foran, stoppkant (45° foran og bak) og ribber for masken
                translate([0, 0, zc]) cube([W, td, tak_t]);
                langs_x(W) {
                    polygon([[0, zc + e], [stopp_h, zc - stopp_h], [stopp_h + 1.5, zc - stopp_h], [2 * stopp_h + 1.5, zc + e]]);
                    for (ya = [0, spor_bak]) ribbe_opp2d(ya, zt);
                }
                // LED-veggen i kanalen: stripa limes på forsiden
                translate([0, kanal_d, zt - e]) cube([W, led_vegg_t, zT - zt + 2 * e]);
                // Øverste rad: skråstag 45° bak LED-veggen ned til det forlengede taket
                if (sist) langs_x(W) polygon([[led_bak - e, zT], [led_bak + 1.7, zT], [led_bak + 1.7 + (zT - zt), zt - e], [led_bak - e + (zT - zt), zt - e]]);
                // Skråstag 45° foran mellom kolonnene, fra T-skinna opp til bakkanten av taket
                if (k > 1) for (c = [1 : k - 1]) if (!har(mgx[r], c)) translate([c * P - stolpe_t / 2, 0, 0]) langs_x(stolpe_t)
                    polygon([[td - 1, zt], [td + 2, zt], [td + 2 + Ls, zr - e], [td - 1 + Ls, zr - e]]);
                // Over en dobbel skuff: finne oppå taket, helt bak til ryggen (står på printplata og bærer taket i printen)
                zf = sist ? zT : z0 + f * Pr + hylle_t - flens_t + e;
                for (c = mgx[r]) translate([c * P - stolpe_t / 2, td - 1, zt - e]) cube([stolpe_t, D - td + 1, zf - zt + e]);
            }
            // Lokk på øverste modul: frontlist med ribber ned (bæres av skråstaget i printen)
            if (topp) {
                translate([0, 0, zlokk]) cube([W, fl_d, list_t]);
                langs_x(W) for (ya = [0, spor_bak]) ribbe_ned2d(ya, zlokk);
            }
            // Åpen rygg: lister + kryss
            lv_rygg(W, Hm, bx, bz);
            // Skrueboss bak for lasker
            for (x = bx, z = bz) translate([x, D - bakvegg + e, z]) rotate([90, 0, 0]) cylinder(d = 7, h = bak_rom - 1);
        }
        for (r = [0 : n - 1]) {
            f = rfx[r];
            z0 = zsum(rfx, r);
            zc = z0 + f * Pr - kh;
            zt = zc + tak_t;
            sist = r == n - 1;
            zT = sist && !topp ? z0 + f * Pr : z0 + f * Pr + hylle_t - list_t;
            td = sist ? tak_d_topp : tak_d;
            za = z0 + hylle_t + skinne_h + 1;
            zm = z0 + hylle_t + (zc - z0 - hylle_t) / 2;
            // Vinduer i siderammene: ett stort bak frontlista og taket, og ett i skuffhøyden helt fram.
            // I en dobbel rad deles de i to med en tverrligger midt på.
            for (x = [-e, W - vegg_t - e]) translate([x, 0, 0]) langs_x(vegg_t + 2 * e)
                for (v = [[td + 2, z0 + f * Pr - 2], [vindu_kant, zc - 2]]) {
                    if (f == 1) vindu2d(v[0], y1, za, v[1]);
                    else { vindu2d(v[0], y1, za, zm - 1.5); vindu2d(v[0], y1, zm + 1.5, v[1]); }
                }
            // Kanalen går gjennom siderammene: stripa, masken og ledningene går videre til neste modul
            for (x = [-e, W - vegg_t - e]) translate([x, -e, zt]) cube([vegg_t + 2 * e, kanal_d + e, zT - zt + e]);
            for (c = [0 : k - 1]) {
                xc = (c + 0.5) * P;
                // Siktemerke for midt-LED-en: hakk i ribba foran og strek på LED-veggen
                translate([xc - 0.5, -e, zt + ribbe_h - 0.8]) cube([1, ribbe_t + 0.8 + e, 1]);
                translate([xc - 0.3, kanal_d - e, zt + 0.5]) cube([0.6, 0.4 + e, zT - zt - 1]);
            }
            // Bolter mellom moduler side om side, ett per rad bak skuffene
            zb = zm;
            yb = D - bakvegg - bak_rom / 2;
            if (vs) translate([-e, yb, zb]) draape_x(bolt_hull, vegg_t + 2 * e);
            if (hs) translate([W - vegg_t - e, yb, zb]) draape_x(bolt_hull, vegg_t + 2 * e);
        }
        // Kjernehull for lask-skruer gjennom ryggen inn i bossen
        for (x = bx, z = bz) translate([x, D + e, z]) rotate([90, 0, 0]) cylinder(d = skrue_kjerne, h = bakvegg + bak_rom - 1.5);
    }
}

module modul_ij(top, i, j) {
    nx = top ? t_nx : m_nx;
    ny = top ? t_ny : m_ny;
    et = mod_rows(top, j);
    lv_modul(mod_k(top, i), len(mod_rader(top, i, j)), j == 0, j == ny - 1, i > 0, i < nx - 1,
             [for (rr = mod_rader(top, i, j)) rr[1]], [for (rr = mod_rader(top, i, j)) rr[2]]);
}
module hoved_modul(i, j) { modul_ij(false, i, j); }
module topp_modul(i, j) { modul_ij(true, i, j); }
// Print: liggende på ryggen (ryggen ned, fronten opp). Skinner, sider og stag står da loddrett,
// og alle flater som vender ned er 45° eller korte broer mellom skinnene/stagene.
module modul_print() { translate([0, 0, D]) rotate([-90, 0, 0]) children(); }

module lv_maske(k) {
    W = k * P - 0.5;
    difference() {
        cube([W, innsats_h, maske_t]);
        for (c = [0 : k - 1])
            translate([(c + 0.5) * P - 0.25 - vb / 2, ribbe_h + 0.5, -e]) cube([vb, innsats_h - 2 * ribbe_h - 1, maske_t + 2 * e]);
    }
}
module lv_diffusor(k) { cube([k * P - 0.5, innsats_h, diffusor_t]); }
// "topp" = toppveggen over Raaco, ellers hovedveggen (hele hylla eller sideveggen)
function sek_k(i) = seksjon == "topp" ? deling(t_K, t_nx, min(i, t_nx - 1)) : deling(m_K, m_nx, min(i, m_nx - 1));

// ---------------------------------------------------------------------
// Lask bak over skjøtene: 2 hull (16 mm) eller 4 hull (16 x 16 mm)
// ---------------------------------------------------------------------
module lv_lask(fire) {
    a = 16;
    w = fire ? a + 10 : 10;
    l = a + 10;
    difference() {
        translate([-w / 2, -l / 2, 0]) cube([w, l, lask_t]);
        for (x = fire ? [-a / 2, a / 2] : [0], y = [-a / 2, a / 2])
            translate([x, y, -e]) {
                cylinder(d = 3.4, h = lask_t + 2 * e);
                translate([0, 0, lask_t - 1.6]) cylinder(d1 = 3.4, d2 = 6.6, h = 1.6 + 2 * e);
            }
    }
}

// ---------------------------------------------------------------------
// Raaco: LED-skinne og klips
// Skinna ligger flatt i spalten mellom radene, foran rammen, med LED-ene
// ned mot skuffen under. Skuffen glir under (leppa bak er 42 mm), og
// skuffen over glir over. Klipsene sitter bare på sideveggene.
// Skinne (origo: venstre-front-bunn, skinna går langs +X)
// ---------------------------------------------------------------------
module raaco_skinne() {
    difference() {
        cube([rs_l, rs_b, rs_h]);
        // Rom for stripa under topplata
        translate([-e, r_vegg, -e]) cube([rs_l + 2 * e, rs_b - 2 * r_vegg, rs_h - r_bund + e]);
    }
}
module raaco_skinne_print() {
    // Diagonalt på byggeplaten
    translate([rs_b / sqrt(2), 0, 0]) rotate([0, 0, 45]) raaco_skinne();
}

// Klips: 2D-profil i YZ, ekstrudert over sideveggens bredde (X).
// Origo: forkant av Raaco-rammen (y = 0), underkant skinne (z = 0).
module raaco_klips_profil() {
    y1 = -klips_t;                 // forside av bakplata
    yr = y1 - 0.2;                 // bakkant av skinna
    yf = yr - rs_b - 0.3;          // forkant av skinna
    zt = rs_h + 0.2;               // overkant skinne + luft
    z_lo = rs_h / 2 - klips_h / 2;
    union() {
        // Bakplate (limes på sideveggen med VHB-tape). Høyden er pitch - 0,4, så klipsene kan stables.
        translate([y1, z_lo]) square([klips_t, klips_h]);
        // Øvre kjeve
        translate([yf - 1.2, zt]) square([y1 - yf + 1.2 + e, 1.6]);
        // Nedre kjeve
        translate([yf - 1.2, -1.6]) square([y1 - yf + 1.2 + e, 1.6]);
        // Klikk-lepper foran (2 x 0,4 mm), skinna trykkes inn forfra
        translate([yf - 1.2, zt - 0.4]) square([1.2, 0.4 + e]);
        translate([yf - 1.2, -e]) square([1.2, 0.4 + e]);
    }
}
module raaco_klips() {
    yr = -klips_t - 0.2;
    difference() {
        rotate([90, 0, 90]) linear_extrude(raaco_sidevegg_b) raaco_klips_profil();
        // Rom for stripa og ledningene i nedre kjeve
        translate([-e, yr - r_vegg - led_bredde - 0.4, -1.6 - e]) cube([raaco_sidevegg_b + 2 * e, led_bredde + 0.4, 1.6 + 2 * e]);
        // Ledningsspor ytterst gjennom øvre kjeve, ned til neste rad
        translate([-e, yr - r_vegg - led_bredde - 0.4, rs_h - e]) cube([kabel_b + e, led_bredde + 0.4, 2.2]);
    }
}
// Print: liggende på ytterkanten (X ned), profilen står rett opp
module raaco_klips_print() { rotate([0, 90, 0]) translate([-raaco_sidevegg_b, 0, 0]) raaco_klips(); }
module raaco_klipsplate() {
    n = 2 * raaco_rader;
    dx = klips_h + 4;
    dy = klips_t + rs_b + 2.5 + 4;
    cols = max(1, floor(plass / dx));
    for (q = [0 : n - 1]) translate([(q % cols) * dx, floor(q / cols) * dy, 0]) raaco_klips_print();
    echo(str("SKJOLDLAB-LED: klipsplate = ", n, " klips"));
}

// ---------------------------------------------------------------------
// Elektronikkboks: ESP32-DevKit + 74AHCT125 på hullkort, 5 V-inntak,
// sikring, lufting og kabelhull. Bunnen printes stående, lokket flatt.
// ---------------------------------------------------------------------
bi = boks_indre; bt = boks_vegg;
bo = [bi[0] + 2 * bt, bi[1] + 2 * bt, bi[2] + bt];
boss_xy = [[bt + 4, bt + 4], [bo[0] - bt - 4, bt + 4], [bt + 4, bo[1] - bt - 4], [bo[0] - bt - 4, bo[1] - bt - 4]];
module elboks() {
    pcx = (bo[0] - pcb[0]) / 2;
    pcy = (bo[1] - pcb[1]) / 2;
    difference() {
        union() {
            cube(bo);
            // Ører for skruer (vegg eller hyllebunn)
            for (x = [-12, bo[0]]) translate([x, bo[1] / 2 - 10, 0]) cube([12, 20, 3]);
        }
        translate([bt, bt, bt]) cube([bi[0], bi[1], bi[2] + e]);
        for (x = [-6, bo[0] + 6]) translate([x, bo[1] / 2, -e]) cylinder(d = 4.2, h = 3 + 2 * e);
        // Venstre ende: 5 V-inntak (DC-kontakt) og sikringsholder
        translate([-e, bo[1] * 0.3, bt + bi[2] * 0.5]) draape_x_opp(dc_hull_d, bt + 2 * e);
        translate([-e, bo[1] * 0.7, bt + bi[2] * 0.5]) draape_x_opp(sikring_hull_d, bt + 2 * e);
        // Høyre ende: kabelhull ut til stripene
        for (q = [0 : kabel_antall - 1])
            translate([bo[0] - bt - e, bo[1] * (q + 1) / (kabel_antall + 1), bt + 10]) draape_x_opp(kabel_hull_d, bt + 2 * e);
        // Forside: USB-luke til ESP32
        translate([usb_luke[2] - usb_luke[0] / 2, -e, usb_luke[3]]) cube([usb_luke[0], bt + 2 * e, usb_luke[1]]);
        // Lufting nederst i langsidene (loddrette spalter)
        for (x = [bo[0] * 0.35 : 6 : bo[0] * 0.8], y = [-e, bo[1] - bt - e])
            translate([x, y, bt + 4]) cube([2.4, bt + 2 * e, 12]);
    }
    // Skruetårn i hjørnene til lokket
    for (p = boss_xy) translate([p[0], p[1], 0]) difference() {
        cylinder(d = 7, h = bo[2]);
        translate([0, 0, bt + 2]) cylinder(d = skrue_kjerne, h = bo[2]);
    }
    // Avstandsstykker til hullkortet
    for (dx = [0, pcb_hull[0]], dy = [0, pcb_hull[1]])
        translate([pcx + (pcb[0] - pcb_hull[0]) / 2 + dx, pcy + (pcb[1] - pcb_hull[1]) / 2 + dy, 0]) difference() {
            cylinder(d = 6, h = bt + 5);
            translate([0, 0, bt]) cylinder(d = 2.2, h = 6);
        }
    // Strekkavlastning: bøyler for strips innenfor kabelhullene
    for (q = [0 : kabel_antall - 1])
        translate([bo[0] - bt - 12, bo[1] * (q + 1) / (kabel_antall + 1), bt - e]) difference() {
            translate([-2, -6, 0]) cube([4, 12, 4]);
            translate([-2 - e, -4, -e]) cube([4 + 2 * e, 8, 2.5]);
        }
}
module elboks_lokk() {
    difference() {
        union() {
            cube([bo[0], bo[1], bt]);
            // Kant som går ned i boksen (fri for skruetårnene i hjørnene)
            difference() {
                translate([bt + 0.3, bt + 0.3, bt - e]) difference() {
                    cube([bi[0] - 0.6, bi[1] - 0.6, 3]);
                    translate([1.2, 1.2, -e]) cube([bi[0] - 3, bi[1] - 3, 3 + 2 * e]);
                }
                for (p = boss_xy) translate([p[0], p[1], 0]) cylinder(d = 8.5, h = bt + 4);
            }
        }
        for (p = boss_xy) translate([p[0], p[1], -e]) {
            cylinder(d = 3.4, h = bt + 3 + 2 * e);
            cylinder(d1 = 6.6, d2 = 3.4, h = 1.6);
        }
        // Lufting: spalter i lokket
        for (x = [bo[0] * 0.2 : 5 : bo[0] * 0.8]) translate([x, bo[1] * 0.2, -e]) cube([2, bo[1] * 0.6, bt + 2 * e]);
    }
}
// Lokket printes med oversiden ned (kanten opp)
module elboks_lokk_print() { elboks_lokk(); }

// ---------------------------------------------------------------------
// Utlegg for print
// ---------------------------------------------------------------------
module skuff_print(nk = 1, nf = 1) { translate([0, grep_ut, 0]) lv_skuff(nk, nf); }
module skuffplate(nk = 1, nf = 1) {
    w = skuff_bredde(nk);
    nx = max(1, floor((plass + 5) / (w + 5)));
    ny = max(1, floor((plass + 5) / (skuff_d + grep_ut + 5)));
    for (a = [0 : nx - 1], b = [0 : ny - 1]) translate([a * (w + 5), b * (skuff_d + grep_ut + 5), 0]) skuff_print(nk, nf);
    echo(str("SKJOLDLAB-LED: skuffplate ", nk, "x", nf, " = ", nx * ny, " skuffer per plate"));
}
module skilleplate(nk = 1, nf = 1) {
    b = skv_b(nk); hh = skv_h(nf);
    nx = max(1, floor((plass + 4) / (b + 4)));
    ny = max(1, floor((plass + 4) / (hh + 4)));
    for (a = [0 : nx - 1], c = [0 : ny - 1]) translate([a * (b + 4), c * (hh + 4), 0]) lv_skillevegg(nk, nf);
    echo(str("SKJOLDLAB-LED: skilleplate ", nk, "x", nf, " = ", nx * ny, " skillevegger per plate"));
}

// ---------------------------------------------------------------------
// Visning
// ---------------------------------------------------------------------
farge_ramme = [0.1, 0.1, 0.11];
farge_skuff = [0.16, 0.16, 0.18];
farge_led = [0.2, 0.45, 1.0];

module lv_seksjon(top) {
    nx = top ? t_nx : m_nx;
    ny = top ? t_ny : m_ny;
    R = top ? t_R : m_R;
    K = top ? t_K : m_K;
    for (i = [0 : nx - 1], j = [0 : ny - 1]) {
        k = mod_k(top, i);
        et = mod_rows(top, j);
        translate([mod_x(top, i), 0, et[0] * Pr]) {
            color(farge_ramme) modul_ij(top, i, j);
            for (rr = mod_rader(top, i, j)) {
                f = rr[1];
                mg = rr[2];
                z = rr[0] * Pr;
                zc = z + f * Pr - kh;
                // Lysstripe bak masken, og ett vindu som lyser (som på bildet)
                translate([0, kanal_d - led_tykk, zc + tak_t + (kh - tak_t - led_bredde) / 2])
                    color([0.25, 0.25, 0.28]) cube([k * P, led_tykk, led_bredde]);
                translate([0, spor_foran, zc + tak_t]) rotate([90, 0, 0]) mirror([0, 0, 1]) color([0.05, 0.05, 0.05]) lv_maske(k);
                if (vis_skuffer) for (c = [0 : k - 1]) if (!har(mg, c))
                    translate([c * P + vegg_t + toleranse, 0, z + hylle_t]) color(farge_skuff) lv_skuff(har(mg, c + 1) ? 2 : 1, f);
            }
        }
    }
    // Én skuff som «lyser» (i rad 2 nedenfra, kolonne 2 i resten av hylla)
    xl = top || !vk_on ? 0 : vk * P;
    if (vis_skuffer) translate([xl + (K > 1 ? 1.5 : 0.5) * P - vb / 2, spor_foran - 0.5, (R > 1 ? 2 : 1) * Pr - kh + tak_t + ribbe_h + 0.5])
        color(farge_led) cube([vb, 1, innsats_h - 2 * ribbe_h - 1]);
}

module hylla() {
    b = 18;
    color([0.75, 0.6, 0.42, 0.35]) {
        translate([-b, 0, -b]) cube([hylle_bredde + 2 * b, hylle_dybde, b]);
        translate([-b, 0, hylle_hoyde]) cube([hylle_bredde + 2 * b, hylle_dybde, b]);
        translate([-b, 0, 0]) cube([b, hylle_dybde, hylle_hoyde]);
        translate([hylle_bredde, 0, 0]) cube([b, hylle_dybde, hylle_hoyde]);
        translate([0, hylle_dybde, 0]) cube([hylle_bredde, 4, hylle_hoyde]);
    }
}

module raaco_med_skinner() {
    color([0.5, 0.5, 0.52]) cube([raaco_bredde, raaco_dybde, raaco_hoyde]);
    for (r = [1 : raaco_rader]) {
        // Skinna over rad r ligger i spalten over skuffen (visning: skuffen i rad r starter på raaco_hoyde - r * pitch)
        z = raaco_hoyde - r * r_pitch + raaco_leppe_h + raaco_luft;
        translate([kabel_b, -klips_t - 0.2 - rs_b, z]) color([0.1, 0.1, 0.1]) raaco_skinne();
        for (x = [0, raaco_bredde - raaco_sidevegg_b]) translate([x, 0, z]) color([0.2, 0.2, 0.22]) raaco_klips();
    }
}

module oversikt() {
    hylla();
    if (!hel) translate([rx0, 0, 0]) raaco_med_skinner();
    if (lag_m) translate([m_x0, 0, 0]) lv_seksjon(false);
    if (lag_t) translate([t_x0, 0, raaco_hoyde]) lv_seksjon(true);
    // Elektronikkboksen ved siden av hylla
    translate([hylle_bredde + 60, 0, 0]) color([0.15, 0.15, 0.16]) elboks();
}

// Hele LED-veggen uten hylle (hele hylla eller sideveggen)
module vegg() { lv_seksjon(false); }

// ---------------------------------------------------------------------
// Valg av del
// ---------------------------------------------------------------------
if (del == "oversikt") oversikt();
else if (del == "vegg") vegg();
else if (del == "modul") { assert(lag_m, "lag_side er av."); modul_print() hoved_modul(min(modul_x, m_nx - 1), min(modul_y, m_ny - 1)); }
else if (del == "topp_modul") { assert(lag_t, "Toppveggen finnes bare med variant = \"rundt_raaco\" og lag_topp = true."); modul_print() topp_modul(min(modul_x, t_nx - 1), min(modul_y, t_ny - 1)); }
else if (del == "skuff") skuff_print();
else if (del == "skuffplate") skuffplate();
else if (del == "skillevegg") lv_skillevegg();
else if (del == "skilleplate") skilleplate();
else if (del == "skuff_2x1") skuff_print(2, 1);
else if (del == "skuff_1x2") skuff_print(1, 2);
else if (del == "skuff_2x2") skuff_print(2, 2);
else if (del == "skuffplate_2x1") skuffplate(2, 1);
else if (del == "skuffplate_1x2") skuffplate(1, 2);
else if (del == "skuffplate_2x2") skuffplate(2, 2);
else if (del == "skilleplate_2x1") skilleplate(2, 1);
else if (del == "skilleplate_1x2") skilleplate(1, 2);
else if (del == "skilleplate_2x2") skilleplate(2, 2);
else if (del == "maske") lv_maske(sek_k(modul_x));
else if (del == "diffusor") lv_diffusor(sek_k(modul_x));
else if (del == "lask") lv_lask(false);
else if (del == "lask4") lv_lask(true);
else if (del == "raaco_skinne") raaco_skinne_print();
else if (del == "raaco_klips") raaco_klips_print();
else if (del == "raaco_klipsplate") raaco_klipsplate();
else if (del == "elboks") elboks();
else if (del == "elboks_lokk") elboks_lokk_print();
else assert(false, str("Ukjent del: ", del));
