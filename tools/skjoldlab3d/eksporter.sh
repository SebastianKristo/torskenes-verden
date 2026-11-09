#!/usr/bin/env bash
# Skjold Lab – eksporter alle printdeler til STL (krever openscad i PATH).
# Bruk: ./eksporter.sh [utmappe] [ekstra -D-parametre ...]
#   ./eksporter.sh stl -D hylle_bredde=565 -D rad_avstand=44.2
# Antall moduler, om topphylle/store skuffer/bakkasser er med, og om kasse L
# må deles, leses fra ekkoet i modellen, så det følger parametrene dine.
set -euo pipefail
cd "$(dirname "$0")"
SCAD=skjoldlab_tilleggsskap.scad
UT=${1:-stl}
shift || true
mkdir -p "$UT"
command -v openscad >/dev/null || { echo "Fant ikke openscad i PATH (se README.md)." >&2; exit 1; }

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
  openscad -o "$UT/$navn.stl" -D "del=\"$d\"" "$@" "$SCAD"
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

echo "Ferdig. Filene ligger i $UT/ (ikke legg dem i git)."
