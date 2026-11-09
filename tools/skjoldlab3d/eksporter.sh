#!/usr/bin/env bash
# Skjold Lab – eksporter alle printdeler til STL (krever openscad i PATH).
# Bruk: ./eksporter.sh [utmappe] [--led | --alle] [ekstra -D-parametre ...]
#   ./eksporter.sh stl -D hylle_bredde=565 -D rad_avstand=44.2   (sorteringen uten LED, som før)
#   ./eksporter.sh stl --led -D led_per_skuff=4                  (bare LED-veggen, til stl/ledvegg/)
#   ./eksporter.sh stl --alle                                    (begge modellene)
# Antall moduler, om topphylle/store skuffer/bakkasser er med, og om kasse L
# må deles, leses fra ekkoet i modellen, så det følger parametrene dine.
# Standardmålene er hylla 560 x 760 x 320 mm og Raaco 300 x 150 x 552 mm.
set -euo pipefail
cd "$(dirname "$0")"
SCAD=skjoldlab_tilleggsskap.scad
LEDSCAD=skjoldlab_ledvegg.scad
UT=${1:-stl}
shift || true
MODUS=gammel
case "${1:-}" in
  --led) MODUS=led; shift ;;
  --alle) MODUS=alle; shift ;;
esac
mkdir -p "$UT"
FEIL=() # deler som ikke lot seg eksportere (skriptet fortsetter og lister dem til slutt)
command -v openscad >/dev/null || { echo "Fant ikke openscad i PATH (se README.md)." >&2; exit 1; }

# LED-veggen (skjoldlab_ledvegg.scad) – moduler og masker leses fra ekkoet
eksporter_led() {
  local ut="$UT/ledvegg" tmp info sx sy tx ty
  mkdir -p "$ut"
  tmp=$(mktemp -d)
  openscad -o "$tmp/info.echo" -D 'del="lask"' "$@" "$LEDSCAD" >"$tmp/log" 2>&1 || true
  info=$(cat "$tmp/info.echo" "$tmp/log" 2>/dev/null || true)
  rm -rf "$tmp"
  echo "$info" | grep SKJOLDLAB-LED || true
  sx=$(echo "$info" | sed -n 's/.*SKJOLDLAB-LED: side moduler \([0-9]*\) x \([0-9]*\).*/\1/p' | head -1)
  sy=$(echo "$info" | sed -n 's/.*SKJOLDLAB-LED: side moduler \([0-9]*\) x \([0-9]*\).*/\2/p' | head -1)
  tx=$(echo "$info" | sed -n 's/.*SKJOLDLAB-LED: topp moduler \([0-9]*\) x \([0-9]*\).*/\1/p' | head -1)
  ty=$(echo "$info" | sed -n 's/.*SKJOLDLAB-LED: topp moduler \([0-9]*\) x \([0-9]*\).*/\2/p' | head -1)
  sx=${sx:-0}; sy=${sy:-0}; tx=${tx:-0}; ty=${ty:-1}
  lagl() { # lagl <filnavn> <del> [ekstra -D ...]
    local navn=$1 d=$2; shift 2
    echo "-> $ut/$navn.stl"
    openscad -o "$ut/$navn.stl" -D "del=\"$d\"" "$@" "$LEDSCAD" || FEIL+=("ledvegg/$navn")
  }
  for d in skuff skuffplate skillevegg skilleplate lask lask4 raaco_skinne raaco_klips raaco_klipsplate elboks elboks_lokk; do
    lagl "$d" "$d" "$@"
  done
  for ((x = 0; x < sx; x++)); do
    for ((y = 0; y < sy; y++)); do lagl "modul_x${x}_y${y}" modul -D "modul_x=$x" -D "modul_y=$y" "$@"; done
    lagl "maske_side_x${x}" maske -D 'seksjon="side"' -D "modul_x=$x" "$@"
    lagl "diffusor_side_x${x}" diffusor -D 'seksjon="side"' -D "modul_x=$x" "$@"
  done
  for ((x = 0; x < tx; x++)); do
    if ((ty > 1)); then
      for ((y = 0; y < ty; y++)); do lagl "topp_modul_x${x}_y${y}" topp_modul -D "modul_x=$x" -D "modul_y=$y" "$@"; done
    else
      lagl "topp_modul_x${x}" topp_modul -D "modul_x=$x" "$@"
    fi
    lagl "maske_topp_x${x}" maske -D 'seksjon="topp"' -D "modul_x=$x" "$@"
    lagl "diffusor_topp_x${x}" diffusor -D 'seksjon="topp"' -D "modul_x=$x" "$@"
  done
  echo "LED-veggen ligger i $ut/ (ikke legg filene i git)."
}

# Til slutt: 3MF ved siden av hver STL (SKJ_3MF=0 slår det av), og liste over deler som feilet.
avslutt() {
  if [[ ${SKJ_3MF:-1} != 0 ]] && command -v python3 >/dev/null; then python3 stl2_3mf.py "$UT" || FEIL+=("3mf"); fi
  if ((${#FEIL[@]})); then echo "FEILET: ${FEIL[*]}" >&2; exit 1; fi
}

if [[ $MODUS == led ]]; then
  eksporter_led "$@"
  avslutt
  exit 0
fi

tmp=$(mktemp -d)
openscad -o "$tmp/info.echo" -D 'del="pinne"' "$@" "$SCAD" >"$tmp/log" 2>&1 || true
info=$(cat "$tmp/info.echo" "$tmp/log" 2>/dev/null || true)
rm -rf "$tmp"
echo "$info" | grep SKJOLDLAB3D || true
mx=$(echo "$info" | sed -n 's/.*SKJOLDLAB3D: \([0-9]*\) x \([0-9]*\) = .*rammemoduler.*/\1/p' | head -1)
my=$(echo "$info" | sed -n 's/.*SKJOLDLAB3D: \([0-9]*\) x \([0-9]*\) = .*rammemoduler.*/\2/p' | head -1)
tsx=$(echo "$info" | sed -n 's/.*SKJOLDLAB3D: tarnstor moduler \([0-9]*\).*/\1/p' | head -1)
tpx=$(echo "$info" | sed -n 's/.*SKJOLDLAB3D: topphylle moduler \([0-9]*\).*/\1/p' | head -1)
mx=${mx:-2}; my=${my:-3}; tsx=${tsx:-0}; tpx=${tpx:-0}

lag() { # lag <filnavn> <del> [ekstra -D ...]
  local navn=$1 d=$2; shift 2
  echo "-> $UT/$navn.stl"
  openscad -o "$UT/$navn.stl" -D "del=\"$d\"" "$@" "$SCAD" || FEIL+=("$navn")
}

# Sidetårn, små skuffer (som før)
for d in skuff skuffplate skillevegg skilleplate lask lask4 pinne; do lag "$d" "$d" "$@"; done
for ((x = 0; x < mx; x++)); do
  for ((y = 0; y < my; y++)); do
    lag "modul_x${x}_y${y}" modul -D "modul_x=$x" -D "modul_y=$y" "$@"
  done
done

# Sidetårn, store skuffer
if ((tsx > 0)); then
  for d in skuff_tarn_stor skillevegg_tarn_stor; do lag "$d" "$d" "$@"; done
  for ((x = 0; x < tsx; x++)); do lag "tarn_stor_modul_x${x}" tarn_stor_modul -D "modul_x=$x" "$@"; done
fi

# Topphylle over Raaco
if ((tpx > 0)); then
  for d in skuff_topp skillevegg_topp; do lag "$d" "$d" "$@"; done
  for ((x = 0; x < tpx; x++)); do lag "topp_modul_x${x}" topp_modul -D "modul_x=$x" "$@"; done
fi

# Løse kasser (L deles i to hvis den er bredere enn byggeplaten)
lag kasse_s kasse_s "$@"
lag kasse_m kasse_m "$@"
if echo "$info" | grep -q 'kasse_l_1'; then
  lag kasse_l_1 kasse_l_1 "$@"
  lag kasse_l_2 kasse_l_2 "$@"
else
  lag kasse_l kasse_l "$@"
fi
if echo "$info" | grep -q 'SKJOLDLAB3D: bakkasser: [0-9]'; then lag bakkasse bakkasse "$@"; fi

if [[ $MODUS == alle ]]; then eksporter_led "$@"; fi

avslutt
echo "Ferdig. STL og 3MF ligger i $UT/ (ikke legg dem i git)."
