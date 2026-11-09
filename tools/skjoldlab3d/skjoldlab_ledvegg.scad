// =====================================================================
// Skjold Lab – LED-vegg med skuffer (lys over skuffen du leter etter)
// =====================================================================
// Parametrisk OpenSCAD-modell (prompt 78). Stilen er som på brukerens bilde:
// sorte, 3D-printede skuffer i rader, og over hver rad en kanal med en
// adresserbar LED-stripe (WS2812B/SK6812, 5 V). Skjold Lab sender et kall
// til WLED, og LED-en over skuffen lyser.
//
// Hylla er 560 x 760 x 320 mm (B x H x D). Raaco-skapet (300 x 150 x 552 mm,
// 12 x 5 skuffer) står nederst inntil én side. LED-veggen fyller resten:
//   (a) SIDEVEGG ved siden av Raaco, i full høyde
//   (b) TOPPVEGG over Raaco
// Raaco får sin egen LED-SKINNE over hver rad, holdt av klips på
// sideveggene (del="raaco_skinne"/"raaco_klips"). ELEKTRONIKKBOKSEN
// (del="elboks"/"elboks_lokk") har plass til ESP32-DevKit, nivåskifter,
// 5 V-inntak og sikring.
//
// LÅST AVSTAND: Skuffavstanden er et helt antall LED-er. Med led_per_m = 60
// er LED-avstanden 16,667 mm, og med led_per_skuff = 3 blir skuffavstanden
// 50 mm. Midt-LED-en står da rett over midten av skuffen, også over
// modulskjøtene, fordi modulbredden alltid er et helt antall skuffer.
//
// Materiale: sort PETG for alt, unntatt diffusoren (natur/hvit PETG,
// eller bakepapir/opal plast i sporet).
//
// VIKTIG: Mål hylla, Raaco-skapet og spalten mellom Raaco-radene før du
// printer (se tools/skjoldlab3d/README.md og tools/skjoldlab-led/README.md).
//
// Koordinater: X = bredde (venstre -> høyre), Y = dybde (front y = 0 -> bak),
// Z = høyde. Rad 1 er øverst og skuff 1 til venstre, som i Skjold Lab.
//
//   openscad -o skuff.stl -D 'del="skuff"' skjoldlab_ledvegg.scad
//   openscad -o modul_x0_y0.stl -D 'del="modul"' -D modul_x=0 -D modul_y=0 skjoldlab_ledvegg.scad
//   openscad -o oversikt.png -D 'del="oversikt"' skjoldlab_ledvegg.scad
// Alle printdeler legges ut ferdig orientert for print (ingen support).
// =====================================================================

/* [Del som skal lages] */
// Hvilken del som vises/eksporteres
del = "oversikt"; // [oversikt, vegg, modul, topp_modul, skuff, skuffplate, skillevegg, skilleplate, maske, diffusor, lask, lask4, raaco_skinne, raaco_klips, raaco_klipsplate, elboks, elboks_lokk]
// Kolonne av moduler (0 = venstre) – modul, topp_modul, maske, diffusor
modul_x = 0;
// Etasje av moduler (0 = nederst) – modul
modul_y = 0;
// Seksjon for maske/diffusor
seksjon = "side"; // [side, topp]
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
// Avstand fra LED til diffusoren (mer = jevnere lys)
led_avstand = 5;

/* [LED-vegg] */
// Lag sideveggen ved siden av Raaco
lag_side = true;
// Lag toppveggen over Raaco
lag_topp = true;
// Radhøyde uten LED-kanal: gulv + skuffåpning (ca. 45)
rad_hoyde = 45;
// Høyde på LED-kanalen over hver rad (0 = auto: led_bredde + 3)
kanal_h = 0;
// Overstyr antall (0 = auto ut fra plassen)
kolonner_side = 0;
rader_side = 0;
kolonner_topp = 0;
rader_topp = 0;
// Rammedybde (0 = auto: hylla eller printeren, det minste)
lv_dybde = 0;
// Maks rammedybde (0 = byggehoyde - 10)
dybde_maks = 0;
// Ytre vegg i en modul. To moduler inntil hverandre gir 2 x vegg_t, som er det samme som skilleveggen inne i modulen.
vegg_t = 1.6;
hylle_t = 2.0;
tak_t = 1.6;
bakvegg = 2.0;
// Rom bak skuffene til skrueboss og mutter
bak_rom = 7;

/* [Skuff] */
skuff_vegg = 1.2;
skuff_bunn = 1.2;
skuff_front = 2.0;
// Avrundet grep: hvor langt det stikker ut, bredde og høyde
grep_ut = 8;
grep_b = 30;
grep_h = 16;
etikett_h = 10;
etikett_dybde = 0.6;
spor_posisjoner = [1/3, 1/2, 2/3];
skillevegg_t = 1.2;
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
plass = byggeplate - plate_margin;                       // 246
dmaks = dybde_maks > 0 ? dybde_maks : byggehoyde - 10;    // 240
pled = 1000 / led_per_m;                                  // 16,667
P = led_per_skuff * pled;                                 // 50 (skuffavstand)
kh = kanal_h > 0 ? kanal_h : led_bredde + 3;              // 13
Pr = rad_hoyde + kh;                                      // 58 (radavstand)
aapning = rad_hoyde - hylle_t;                            // 43
skuff_h = aapning - stopp_h - luft_over;                  // 40
D = lv_dybde > 0 ? lv_dybde : min(hylle_dybde - klaring, dmaks); // 240
skuff_d = min(D - bakvegg - bak_rom, plass - grep_ut);    // 231
S = P - 2 * vegg_t;                                       // 46,8 (åpning)
skuff_b = S - 2 * toleranse;                              // 46,0
kanal_ribbe_y = 2 * ribbe_t + spor_b;                     // bak kant av bakre ribbe
kanal_d = kanal_ribbe_y + led_avstand + led_tykk;         // forkant av LED-veggen
tak_d = kanal_d + 1.6 + 4;                                // taket bak åpningen
innsats_h = kh - tak_t - toleranse;                       // maske/diffusor
vb = vindu_b > 0 ? vindu_b : min(14, P - 8);
led_odde = led_per_skuff % 2 == 1;
led_offset = led_odde ? pled / 2 : pled;                  // første LED fra venstre kant
function led_antall(K) = led_odde ? K * led_per_skuff : K * led_per_skuff - 1;

kpm_maks = max(1, floor(plass / P));
rpm_maks = max(1, floor((plass - hylle_t - ribbe_h) / Pr));
function deling(n, m, i) = floor(n / m) + (i < n % m ? 1 : 0);
function sum_deling(n, m, i) = i <= 0 ? 0 : deling(n, m, i - 1) + sum_deling(n, m, i - 1);

// Plassering
rx0 = raaco_side == "venstre" ? 0 : hylle_bredde - raaco_bredde;
// Sideveggen (a)
s_Wav = hylle_bredde - raaco_bredde - 2 * klaring;        // 254
s_Hav = hylle_hoyde - klaring;                            // 757
s_K = kolonner_side > 0 ? kolonner_side : floor(s_Wav / P);          // 5
s_R = rader_side > 0 ? rader_side : floor((s_Hav - hylle_t) / Pr);   // 13
s_nx = max(1, ceil(s_K / kpm_maks));                      // 2
s_ny = max(1, ceil(s_R / rpm_maks));                      // 4
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
assert(raaco_side == "venstre" || raaco_side == "hoyre", "raaco_side må være \"venstre\" eller \"hoyre\".");
assert(led_per_skuff >= 1 && led_per_skuff == floor(led_per_skuff), "led_per_skuff må være et helt tall >= 1.");
assert(P <= plass, "Skuffavstanden er større enn byggeplaten. Sett led_per_skuff lavere.");
assert(skuff_b >= 25, str("Skuffene blir bare ", skuff_b, " mm brede. Sett led_per_skuff høyere."));
assert(skuff_h >= 20, str("Skuffene blir bare ", skuff_h, " mm høye. Øk rad_hoyde."));
assert(kh - tak_t >= led_bredde + 0.4, str("LED-kanalen (", kh, " mm) er for lav for en ", led_bredde, " mm stripe. Øk kanal_h."));
assert(D <= byggehoyde, str("Rammene printes liggende på ryggen, så dybden (", D, " mm) må være <= byggehoyde (", byggehoyde, " mm)."));
assert(skuff_d + grep_ut <= plass, "Skuffen får ikke plass på byggeplaten. Sett lv_dybde lavere.");
assert(skuff_d >= 60, "Skuffene blir for korte. Sjekk lv_dybde og bak_rom.");
assert(bak_rom >= 6, "bak_rom må være minst 6 mm (skrueboss bak skuffene).");
assert(rpm_maks >= 1, "Radavstanden er større enn byggeplaten.");
assert(raaco_hoyde + klaring <= hylle_hoyde, "Raaco-skapet er høyere enn hylla.");
assert(!lag_side || s_K >= 1, str("For lite plass ved siden av Raaco (", s_Wav, " mm) til én skuff på ", P, " mm."));
assert(!lag_side || s_W <= s_Wav, str("Sideveggen (", s_W, " mm) er bredere enn plassen (", s_Wav, " mm). Sett kolonner_side lavere."));
assert(!lag_side || s_H <= s_Hav, str("Sideveggen (", s_H, " mm) er høyere enn hylla. Sett rader_side lavere."));
assert(!lag_topp || t_R >= 1, str("Bare ", t_Hav, " mm over Raaco – for lite til én rad. Sett lag_topp = false."));
assert(!lag_topp || t_W <= t_Wav, str("Toppveggen (", t_W, " mm) er bredere enn Raaco. Sett kolonner_topp lavere."));
assert(!lag_topp || t_H <= t_Hav, str("Toppveggen (", t_H, " mm) er for høy. Sett rader_topp lavere."));
assert(rs_h <= r_spalte - 2 * raaco_luft,
       str("Raaco-skinna (", rs_h, " mm) får ikke plass i spalten (", r_spalte, " mm) mellom radene. Mål raaco_spalte. ",
           "Er spalten mindre enn ", rs_h + 2 * raaco_luft, " mm, limer du stripa rett på rammen i stedet (se README)."));
assert((rs_l + rs_b) / sqrt(2) <= plass, "Raaco-skinna får ikke plass diagonalt på byggeplaten.");

// ---------------------------------------------------------------------
// Oversikt i konsollen
// ---------------------------------------------------------------------
echo(str("SKJOLDLAB-LED: hylle ", hylle_bredde, " x ", hylle_dybde, " x ", hylle_hoyde, " mm (B x D x H), Raaco ", raaco_bredde, " x ", raaco_dybde, " x ", raaco_hoyde,
         " mm til ", raaco_side));
echo(str("SKJOLDLAB-LED: LED ", led_per_m, "/m = ", pled, " mm, ", led_per_skuff, " per skuff -> skuffavstand ", P, " mm, radavstand ", Pr,
         " mm (", rad_hoyde, " + kanal ", kh, ")"));
echo(str("SKJOLDLAB-LED: skuff ", skuff_b, " x ", skuff_d, " x ", skuff_h, " mm (B x D x H), ", skuff_h + stopp_h, " mm med leppe bak, rammedybde ", D, " mm"));
if (lag_side) {
    echo(str("SKJOLDLAB-LED: sidevegg ", s_R, " rader x ", s_K, " kolonner = ", s_R * s_K, " skuffer, ", s_W, " x ", D, " x ", s_H, " mm, x = ", s_x0));
    echo(str("SKJOLDLAB-LED: side moduler ", s_nx, " x ", s_ny, " kolonner ", [for (i = [0 : s_nx - 1]) deling(s_K, s_nx, i)],
             " rader ", [for (j = [0 : s_ny - 1]) deling(s_R, s_ny, j)]));
}
if (lag_topp) {
    echo(str("SKJOLDLAB-LED: toppvegg ", t_R, " rader x ", t_K, " kolonner = ", t_R * t_K, " skuffer, ", t_W, " x ", D, " x ", t_H, " mm, x = ", t_x0));
    echo(str("SKJOLDLAB-LED: topp moduler ", t_nx, " x ", t_ny, " kolonner ", [for (i = [0 : t_nx - 1]) deling(t_K, t_nx, i)]));
}
echo(str("SKJOLDLAB-LED: Raaco-skinne ", rs_l, " x ", rs_b, " x ", rs_h, " mm, ", raaco_rader, " stk + ", 2 * raaco_rader,
         " klips, pitch ", r_pitch, " mm, spalte ", r_spalte, " mm, ", r_leds, " LED-er per rad"));
n_side = lag_side ? s_R * led_antall(s_K) : 0;
n_topp = lag_topp ? t_R * led_antall(t_K) : 0;
n_raaco = raaco_rader * r_leds;
echo(str("SKJOLDLAB-LED: LED-er: Raaco ", n_raaco, ", sidevegg ", n_side, ", toppvegg ", n_topp, ", sum ", n_raaco + n_side + n_topp,
         " (ca. ", ceil((n_raaco + n_side + n_topp) * pled / 100) / 10, " m stripe)"));
echo(str("SKJOLDLAB-LED: Skjold Lab: «Hovedskap» start 0, drawerPitchMm ", raaco_bredde / raaco_kolonner, ", firstDrawerXmm ", raaco_bredde / raaco_kolonner / 2,
         ", ", r_leds, " per rad, offsetMm ", pled / 2,
         lag_topp ? str("; «LED-vegg topp» ", t_R, " x ", t_K, " start ", n_raaco, ", drawerPitchMm ", P, ", firstDrawerXmm ", P / 2, ", ",
                        led_antall(t_K), " per rad, offsetMm ", led_offset) : "",
         lag_side ? str("; «LED-vegg side» ", s_R, " x ", s_K, " start ", n_raaco + n_topp, ", drawerPitchMm ", P, ", firstDrawerXmm ", P / 2, ", ",
                        led_antall(s_K), " per rad, offsetMm ", led_offset) : ""));
// Rekkefølge på stripene: utgang A = Raaco (rad 1 øverst, start til venstre, serpentine),
// utgang B = toppveggen og så sideveggen (toppveggen slutter til høyre, rett ved sideveggens rad 1).

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

// ---------------------------------------------------------------------
// Skuff (origo: front-venstre-bunn av skuffkroppen, front mot -Y)
// ---------------------------------------------------------------------
module lv_skuff() {
    w = skuff_b; d = skuff_d; h = skuff_h; t = skuff_vegg;
    ribbe = 1.0;
    gap = skillevegg_t + toleranse;
    L = d - skuff_front - t;
    gb = min(grep_b, w - 6);
    r = min(grep_ut, gb / 2);
    eh = min(etikett_h, h - grep_h - 4);
    eb = w - 8;
    difference() {
        union() {
            cube([w, d, h]);
            // Avrundet grep foran (som på bildet). Skrå overside, ingen support.
            translate([(w - gb) / 2, 0, 0]) hull() {
                linear_extrude(max(1, grep_h - grep_ut)) hull() {
                    translate([r, -grep_ut + r]) circle(r = r);
                    translate([gb - r, -grep_ut + r]) circle(r = r);
                    translate([0, -e]) square([gb, e]);
                }
                translate([0, -e, grep_h - e]) cube([gb, e, e]);
            }
            // Stoppleppe bak: tar imot kanten under taket når skuffen trekkes ut
            translate([2, 0, 0]) rotate([90, 0, 90]) linear_extrude(w - 4)
                polygon([[d - 2, h - e], [d, h - e], [d, h + stopp_h - 1], [d - 1, h + stopp_h], [d - 2, h + stopp_h]]);
        }
        // Innvendig rom
        translate([t, skuff_front, skuff_bunn]) cube([w - 2 * t, L, h]);
        // Etikettfelt øverst på fronten
        translate([(w - eb) / 2, -e, h - 2 - eh]) cube([eb, etikett_dybde + e, eh]);
    }
    // Spor for skillevegger: ribbepar på begge sidevegger
    for (p = spor_posisjoner) {
        yc = skuff_front + p * L;
        for (dy = [-(gap / 2 + ribbe), gap / 2]) {
            translate([t - e, yc + dy, skuff_bunn - e]) cube([ribbe + e, ribbe, h - skuff_bunn - 1.5]);
            translate([w - t - ribbe, yc + dy, skuff_bunn - e]) cube([ribbe + e, ribbe, h - skuff_bunn - 1.5]);
        }
    }
}

// Skillevegg, liggende for print
module lv_skillevegg() {
    bw = skuff_b - 2 * skuff_vegg - toleranse;
    bh = skuff_h - skuff_bunn - 1;
    difference() {
        cube([bw, bh, skillevegg_t]);
        translate([bw / 2, bh + 2, -e]) cylinder(r = 5, h = skillevegg_t + 2 * e);
    }
}

// ---------------------------------------------------------------------
// Rammemodul (origo: front-venstre-bunn, front mot -Y)
// k = kolonner, n = rader, bunn = nederste modul i seksjonen,
// topp = øverste modul (får tak), vs/hs = nabo til venstre/høyre
// ---------------------------------------------------------------------
module lv_modul(k, n, bunn, topp, vs, hs) {
    W = k * P;
    Hm = n * Pr + (topp ? hylle_t : 0);
    bx = [8, W - 8];
    bz = [8, n * Pr - 8];
    difference() {
        union() {
            // Bakvegg
            translate([0, D - bakvegg, 0]) cube([W, bakvegg, Hm]);
            // Sidevegger
            for (x = [0, W - vegg_t]) translate([x, 0, 0]) cube([vegg_t, D, Hm]);
            for (r = [0 : n - 1]) {
                z0 = r * Pr;
                zc = z0 + rad_hoyde;           // underkant tak = overkant skuffåpning
                // Gulv
                translate([0, 0, z0]) cube([W, D, hylle_t]);
                // Spor-ribber ned fra gulvet: holder overkant av masken i kanalen under.
                // I nederste rad i en modul stikker de ned i modulen under og låser fronten.
                if (!(bunn && r == 0)) for (y = [0, ribbe_t + spor_b])
                    translate([0, y, z0 - ribbe_h]) cube([W, ribbe_t, ribbe_h + e]);
                // Skillevegger mellom skuffene (2 x vegg_t, som en modulskjøt)
                if (k > 1) for (c = [1 : k - 1])
                    translate([c * P - vegg_t, 0, z0 + hylle_t - e]) cube([2 * vegg_t, D - bakvegg + e, aapning + 2 * e]);
                // Tak over skuffåpningen (bare foran)
                translate([0, 0, zc]) cube([W, tak_d, tak_t]);
                // Stoppkant: skrå forside, loddrett innside
                translate([0, 0, 0]) rotate([90, 0, 90]) linear_extrude(W)
                    polygon([[0, zc + e], [stopp_h, zc - stopp_h], [stopp_h + 1.5, zc - stopp_h], [stopp_h + 1.5, zc + e]]);
                // Spor-ribber opp fra taket (underkant av masken)
                for (y = [0, ribbe_t + spor_b]) translate([0, y, zc + tak_t - e]) cube([W, ribbe_t, ribbe_h + e]);
                // LED-veggen i kanalen: stripa limes på forsiden
                translate([0, kanal_d, zc + tak_t - e]) cube([W, 1.6, z0 + Pr - zc - tak_t + 2 * e]);
            }
            // Tak på øverste modul
            if (topp) translate([0, 0, n * Pr]) cube([W, D, hylle_t]);
            // Skrueboss bak for lasker
            for (x = bx, z = bz) translate([x, D - bakvegg + e, z]) rotate([90, 0, 0]) cylinder(d = 7, h = bak_rom - 1);
        }
        for (r = [0 : n - 1]) {
            z0 = r * Pr;
            zc = z0 + rad_hoyde;
            // Kanalen går gjennom sideveggene: stripa, masken og ledningene går videre til neste modul
            for (x = [-e, W - vegg_t - e]) translate([x, -e, zc + tak_t]) cube([vegg_t + 2 * e, kanal_d + e, z0 + Pr - zc - tak_t + e]);
            for (c = [0 : k - 1]) {
                xc = (c + 0.5) * P;
                // Siktemerke for midt-LED-en: hakk i ribba foran og strek på LED-veggen
                translate([xc - 0.5, -e, zc + tak_t + ribbe_h - 0.8]) cube([1, ribbe_t + 2 * e, 1]);
                translate([xc - 0.3, kanal_d - e, zc + tak_t + 0.5]) cube([0.6, 0.4 + e, kh - tak_t - 1]);
            }
            // Bolter mellom moduler side om side, ett per rad bak skuffene
            zb = z0 + hylle_t + aapning / 2;
            yb = D - bakvegg - bak_rom / 2;
            if (vs) translate([-e, yb, zb]) draape_x(bolt_hull, vegg_t + 2 * e);
            if (hs) translate([W - vegg_t - e, yb, zb]) draape_x(bolt_hull, vegg_t + 2 * e);
        }
        // Kjernehull for lask-skruer gjennom bakveggen inn i bossen
        for (x = bx, z = bz) translate([x, D + e, z]) rotate([90, 0, 0]) cylinder(d = skrue_kjerne, h = bakvegg + bak_rom - 1.5);
    }
}

module side_modul(i, j) {
    lv_modul(deling(s_K, s_nx, i), deling(s_R, s_ny, j), j == 0, j == s_ny - 1, i > 0, i < s_nx - 1);
}
module topp_modul(i, j) {
    lv_modul(deling(t_K, t_nx, i), deling(t_R, t_ny, j), j == 0, j == t_ny - 1, i > 0, i < t_nx - 1);
}
// Print: liggende på ryggen (bakveggen ned, fronten opp)
module modul_print() { translate([0, 0, D]) rotate([-90, 0, 0]) children(); }

// ---------------------------------------------------------------------
// Maske (sort, vindu over hver skuff) og diffusor (natur/hvit), liggende
// ---------------------------------------------------------------------
module lv_maske(k) {
    W = k * P - 0.5;
    difference() {
        cube([W, innsats_h, maske_t]);
        for (c = [0 : k - 1])
            translate([(c + 0.5) * P - 0.25 - vb / 2, ribbe_h + 0.5, -e]) cube([vb, innsats_h - 2 * ribbe_h - 1, maske_t + 2 * e]);
    }
}
module lv_diffusor(k) { cube([k * P - 0.5, innsats_h, diffusor_t]); }
function sek_k(i) = seksjon == "topp" ? deling(t_K, t_nx, min(i, t_nx - 1)) : deling(s_K, s_nx, min(i, s_nx - 1));

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
module skuff_print() { translate([0, grep_ut, 0]) lv_skuff(); }
module skuffplate() {
    nx = max(1, floor((plass + 5) / (skuff_b + 5)));
    ny = max(1, floor((plass + 5) / (skuff_d + grep_ut + 5)));
    for (a = [0 : nx - 1], b = [0 : ny - 1]) translate([a * (skuff_b + 5), b * (skuff_d + grep_ut + 5), 0]) skuff_print();
    echo(str("SKJOLDLAB-LED: skuffplate = ", nx * ny, " skuffer per plate"));
}
module skilleplate() {
    bw = skuff_b - 2 * skuff_vegg - toleranse;
    bh = skuff_h - skuff_bunn - 1;
    nx = max(1, floor((plass + 4) / (bw + 4)));
    ny = max(1, floor((plass + 4) / (bh + 4)));
    for (a = [0 : nx - 1], b = [0 : ny - 1]) translate([a * (bw + 4), b * (bh + 4), 0]) lv_skillevegg();
    echo(str("SKJOLDLAB-LED: skilleplate = ", nx * ny, " skillevegger per plate"));
}

// ---------------------------------------------------------------------
// Visning
// ---------------------------------------------------------------------
farge_ramme = [0.1, 0.1, 0.11];
farge_skuff = [0.16, 0.16, 0.18];
farge_led = [0.2, 0.45, 1.0];

module lv_seksjon(K, R, nx, ny, er_topp) {
    for (i = [0 : nx - 1], j = [0 : ny - 1]) {
        k = deling(K, nx, i);
        n = deling(R, ny, j);
        translate([sum_deling(K, nx, i) * P, 0, sum_deling(R, ny, j) * Pr]) {
            color(farge_ramme) if (er_topp) topp_modul(i, j); else side_modul(i, j);
            for (r = [0 : n - 1]) {
                // Lysstripe bak masken, og ett vindu som lyser (som på bildet)
                translate([0, kanal_d - led_tykk, r * Pr + rad_hoyde + tak_t + (kh - tak_t - led_bredde) / 2])
                    color([0.25, 0.25, 0.28]) cube([k * P, led_tykk, led_bredde]);
                translate([0, ribbe_t, r * Pr + rad_hoyde + tak_t]) rotate([90, 0, 0]) mirror([0, 0, 1]) color([0.05, 0.05, 0.05]) lv_maske(k);
                if (vis_skuffer) for (c = [0 : k - 1])
                    translate([c * P + vegg_t + toleranse, 0, r * Pr + hylle_t]) color(farge_skuff) lv_skuff();
            }
        }
    }
    // Én skuff som «lyser»
    if (vis_skuffer) translate([(K > 1 ? 1.5 : 0.5) * P - vb / 2, ribbe_t - 0.5, (R > 1 ? 1 : 0) * Pr + rad_hoyde + tak_t + ribbe_h + 0.5])
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
    translate([rx0, 0, 0]) raaco_med_skinner();
    if (lag_side) translate([s_x0, 0, 0]) lv_seksjon(s_K, s_R, s_nx, s_ny, false);
    if (lag_topp) translate([t_x0, 0, raaco_hoyde]) lv_seksjon(t_K, t_R, t_nx, t_ny, true);
    // Elektronikkboksen ved siden av hylla
    translate([hylle_bredde + 60, 0, 0]) color([0.15, 0.15, 0.16]) elboks();
}

// Hele LED-veggen uten hylle (sideveggen)
module vegg() { lv_seksjon(s_K, s_R, s_nx, s_ny, false); }

// ---------------------------------------------------------------------
// Valg av del
// ---------------------------------------------------------------------
if (del == "oversikt") oversikt();
else if (del == "vegg") vegg();
else if (del == "modul") { assert(lag_side, "lag_side er av."); modul_print() side_modul(min(modul_x, s_nx - 1), min(modul_y, s_ny - 1)); }
else if (del == "topp_modul") { assert(lag_topp, "lag_topp er av."); modul_print() topp_modul(min(modul_x, t_nx - 1), min(modul_y, t_ny - 1)); }
else if (del == "skuff") skuff_print();
else if (del == "skuffplate") skuffplate();
else if (del == "skillevegg") lv_skillevegg();
else if (del == "skilleplate") skilleplate();
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
