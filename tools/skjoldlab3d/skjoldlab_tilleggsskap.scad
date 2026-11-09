// =====================================================================
// Skjold Lab – tilleggsskap (3D-print) som matcher hovedskapet
// =====================================================================
// Parametrisk OpenSCAD-modell for et skuffeskap som fyller ca. 27 cm
// ledig hyllebredde ved siden av hovedskapet (Raaco 150-01-typen,
// 12 rader x 5 kolonner). Samme radavstand og skuffhøyde som hovedskapet,
// så radene står på linje.
//
// VIKTIG: Standardmålene under er TYPISKE mål for Raaco 150-01
// (skap ca. 306 x 150 x 552 mm, B x D x H). De er ikke kontrollert mot
// ditt skap. Mål ditt eget skap og én skuff (se målekladden i README.md,
// 6 mål) og skriv dem inn før du printer noe stort.
//
// Koordinater (skapet): X = bredde (venstre -> høyre), Y = dybde
// (front y=0 -> bak), Z = høyde (gulv -> topp). Rad 1 er øverst,
// skuff 1 er til venstre – samme nummerering som i Skjold Lab.
//
// Velg del med «del» (Customizer eller -D på kommandolinjen), f.eks.:
//   openscad -o skuff.stl -D 'del="skuff"' skjoldlab_tilleggsskap.scad
//   openscad -o modul_0_1.stl -D 'del="modul"' -D modul_x=0 -D modul_y=1 skjoldlab_tilleggsskap.scad
// Alle deler legges ut ferdig orientert for print (ingen support).
// =====================================================================

/* [Del som skal lages] */
// Hvilken del som vises/eksporteres
del = "samlet"; // [samlet, modul, skuff, skuffplate, skillevegg, skilleplate, lask, lask4, pinne]
// Rammemodul: kolonne av moduler (0 = venstre)
modul_x = 0;
// Rammemodul: etasje av moduler (0 = nederst)
modul_y = 0;
// I «samlet»: vis skuffene
vis_skuffer = true;

/* [Målekladd – mål ditt eget skap (se README)] */
// Mål 1: ledig bredde i hylla minus 3–5 mm luft (mm)
skap_bredde = 270;
// Mål 2: hovedskapets totale høyde (mm)
skap_hoyde = 552;
// Mål 3: hovedskapets dybde (mm)
skap_dybde = 150;
// Mål 4: radavstand = (overkant skuff rad 1 – overkant skuff rad 12) / 11 (mm)
rad_avstand = 44;
// Mål 5: skuffhøyde, utvendig, uten håndtak (mm)
skuff_hoyde = 37;
// Mål 6: fra underkant skap til underkant nederste skuff (mm)
nederste_skuff_z = 14;
// Antall rader (som hovedskapet)
rader = 12;

/* [Skuffer] */
// Ønsket skuffbredde – antall kolonner regnes ut fra bredden (mm)
skuff_bredde_onsket = 60;
// Tving antall kolonner (0 = regn ut automatisk)
kolonner_tvunget = 0;
// Tving skuffdybde (0 = regn ut fra skap_dybde)
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
// Avledede mål
// ---------------------------------------------------------------------
plass = byggeplate - plate_margin;

// Bredden deles i moduler som får plass på byggeplaten (270 -> 2 x 135)
moduler_x = max(1, ceil(skap_bredde / plass));
modul_bredde = skap_bredde / moduler_x;
indre_b = modul_bredde - 2 * veggtykkelse;

// Kolonner per modul og totalt (270 mm -> 4 skuffer à ca. 63 mm)
kpm_auto = max(1, round((indre_b + skinne_b) / (skuff_bredde_onsket + 2 * toleranse + skinne_b)));
kpm = kolonner_tvunget > 0 ? ceil(kolonner_tvunget / moduler_x) : kpm_auto;
kolonner = kpm * moduler_x;
slot = (indre_b - (kpm - 1) * skinne_b) / kpm;   // bredde per kolonne
skuff_bredde = slot - 2 * toleranse;

skuff_dybde = skuff_dybde_tvunget > 0 ? skuff_dybde_tvunget : skap_dybde - bakvegg - bak_rom;
stolpe_d = skap_dybde - bakvegg - skuff_dybde - 1;  // stolpene starter 1 mm bak skuffen
stolpe_yc = skap_dybde - bakvegg - stolpe_d / 2;

// Høyder: sokkel under nederste hylle og topp over øverste rad
sokkel_h = nederste_skuff_z - hylle_t;
topp_h = skap_hoyde - sokkel_h - rader * rad_avstand;
klaring = rad_avstand - hylle_t - skuff_hoyde;     // luft over skuffen
tunge_h = min(tunge_h_maks, klaring - 1.5);

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
// Kontroller
// ---------------------------------------------------------------------
assert(klaring >= toleranse + 1, str("For lite luft over skuffen (", klaring, " mm). Sjekk rad_avstand, hylle_t og skuff_hoyde."));
assert(sokkel_h >= hylle_t, "nederste_skuff_z er for liten i forhold til hylle_t.");
assert(topp_h >= hylle_t, str("Toppen blir for tynn (", topp_h, " mm). Sjekk skap_hoyde, rad_avstand og nederste_skuff_z."));
assert(maks_rader >= 1, "rad_avstand er større enn byggeplaten.");
assert(bak_rom >= 7, "bak_rom må være minst 7 mm (plass til stolper og bolter).");
assert(skuff_bredde >= 20, "Skuffene blir for smale – sett kolonner_tvunget lavere.");
assert(skap_dybde <= byggehoyde, "Modulene printes liggende på ryggen, så skap_dybde må være <= byggehoyde.");
assert(skuff_dybde + grep_ut <= plass, "Skuffen får ikke plass på byggeplaten.");
for (j = [0 : moduler_y - 1]) assert(modul_h(j) + tunge_h <= plass, str("Etasje ", j, " er for høy for byggeplaten."));

echo(str("SKJOLDLAB3D: ", rader, " rader x ", kolonner, " kolonner = ", rader * kolonner, " skuffer"));
echo(str("SKJOLDLAB3D: skuff ", skuff_bredde, " x ", skuff_dybde, " x ", skuff_hoyde, " mm (B x D x H), luft over ", klaring, " mm"));
echo(str("SKJOLDLAB3D: ", moduler_x, " x ", moduler_y, " = ", moduler_x * moduler_y, " rammemoduler à ", modul_bredde, " mm bredde, høyder ",
         [for (j = [0 : moduler_y - 1]) modul_h(j)], " mm, rader per etasje ", [for (j = [0 : moduler_y - 1]) rader_i(j)]));
echo(str("SKJOLDLAB3D: sokkel ", sokkel_h, " mm, topp ", topp_h, " mm, totalhøyde ", sokkel_h + rader * rad_avstand + topp_h, " mm"));
echo(str("SKJOLDLAB3D: deler: ", (moduler_y - 1) * 2, " lask, ", (moduler_y - 1) * (moduler_x - 1), " lask4, ",
         (moduler_y - 1) * moduler_x * 2, " pinner, ", rader * (moduler_x - 1), " M3x20-bolter m/mutter, ",
         (moduler_y - 1) * (2 * 2 + (moduler_x - 1) * 4), " M3x10 selvgjengende skruer"));

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

// ---------------------------------------------------------------------
// Skuff (origo: front-venstre-bunn av skuffkroppen, front mot -Y)
// ---------------------------------------------------------------------
module skuff() {
    w = skuff_bredde; d = skuff_dybde; h = skuff_hoyde; t = skuff_vegg;
    ribbe = 1.0;                          // sporribbe: tykkelse og dybde
    gap = skillevegg_t + toleranse;       // sporbredde
    L = d - skuff_front - t;              // innvendig dybde
    grep_b = min(w * 0.6, 36);
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
        translate([t, skuff_front, skuff_bunn]) cube([w - 2 * t, L, h]);
        // Etikettfelt (forsenkning for klistrelapp/papir), øverst på fronten
        translate([(w - eb) / 2, -e, h - 2.5 - etikett_h]) cube([eb, etikett_dybde + e, etikett_h]);
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
module skillevegg() {
    bw = skuff_bredde - 2 * skuff_vegg - toleranse;
    bh = skuff_hoyde - skuff_bunn - 1;
    difference() {
        cube([bw, bh, skillevegg_t]);
        // Fingergrep øverst (halvsirkel), gjør veggen lett å løfte ut
        translate([bw / 2, bh + 2, -e]) cylinder(r = 5, h = skillevegg_t + 2 * e);
    }
}

// ---------------------------------------------------------------------
// Rammemodul (i = kolonne av moduler, j = etasje), skapkoordinater
// ---------------------------------------------------------------------
module kasse(z0, h, med_bunn, med_tak) {
    mb = modul_bredde; D = skap_dybde;
    if (h < 2 * hylle_t + 2) {
        translate([0, 0, z0]) cube([mb, D, h]);
    } else {
        if (med_bunn) translate([0, 0, z0]) cube([mb, D, hylle_t]);
        if (med_tak) translate([0, 0, z0 + h - hylle_t]) cube([mb, D, hylle_t]);
        translate([0, 0, z0]) cube([mb, frontlist_t, h]);
    }
}

module ramme_modul(i, j) {
    mb = modul_bredde; D = skap_dybde; H = modul_h(j); n = rader_i(j); zb = rad_base(j);
    venstre_skjot = i > 0;
    hoyre_skjot = i < moduler_x - 1;
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
            if (j == 0) kasse(0, sokkel_h, true, false);
            if (j == moduler_y - 1) kasse(zb + n * rad_avstand, topp_h, true, true);
            // Hjørnestolper bak (bak skuffene), full høyde
            for (x = stolpe_xs()) translate([x - stolpe_b / 2, D - bakvegg - stolpe_d, 0]) cube([stolpe_b, stolpe_d + e, H]);
            // Tunger under gulvet som griper innenfor sideveggene på modulen under
            if (j > 0) for (x = [veggtykkelse + toleranse / 2, mb - veggtykkelse - toleranse / 2 - tunge_b])
                translate([x, 5, -tunge_h]) cube([tunge_b, skuff_dybde - 5, tunge_h + e]);
        }
        // Pinnehull i stolpene (opp og ned)
        for (x = stolpe_xs()) {
            if (j > 0) translate([x, stolpe_yc, -e]) draape_z(pinne_d + toleranse, pinne_dybde + e);
            if (j < moduler_y - 1) translate([x, stolpe_yc, H - pinne_dybde]) draape_z(pinne_d + toleranse, pinne_dybde + e);
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
// Utlegg
// ---------------------------------------------------------------------
// Rammemodul for print: liggende på ryggen (bakveggen ned)
module modul_print(i, j) {
    translate([0, 0, skap_dybde]) rotate([-90, 0, 0]) ramme_modul(i, j);
}

module skuff_print() { translate([0, grep_ut, 0]) skuff(); }

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

module samlet() {
    for (i = [0 : moduler_x - 1], j = [0 : moduler_y - 1])
        translate([i * modul_bredde, 0, modul_z(j)]) color([0.13, 0.13, 0.14]) ramme_modul(i, j);
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
                color([0.85, 0.9, 0.95, 0.55]) skuff();
        }
}

if (del == "samlet") samlet();
else if (del == "modul") modul_print(min(modul_x, moduler_x - 1), min(modul_y, moduler_y - 1));
else if (del == "skuff") skuff_print();
else if (del == "skuffplate") skuffplate();
else if (del == "skillevegg") skillevegg();
else if (del == "skilleplate") skilleplate();
else if (del == "lask") lask(false);
else if (del == "lask4") lask(true);
else if (del == "pinne") pinne();
else assert(false, str("Ukjent del: ", del));
