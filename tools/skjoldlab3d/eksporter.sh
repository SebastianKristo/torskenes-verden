#!/usr/bin/env bash
# Skjold Lab – eksporter alle deler i tilleggsskapet til STL (krever openscad i PATH).
# Bruk: ./eksporter.sh [utmappe] [ekstra -D-parametre ...]
#   ./eksporter.sh stl -D skap_bredde=265 -D rad_avstand=44.2
# Antall moduler leses fra ekkoet i modellen, så det følger parametrene dine.
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
mx=${mx:-2}; my=${my:-3}

for d in skuff skuffplate skillevegg skilleplate lask lask4 pinne; do
  echo "-> $UT/$d.stl"
  openscad -o "$UT/$d.stl" -D "del=\"$d\"" "$@" "$SCAD"
done
for ((x = 0; x < mx; x++)); do
  for ((y = 0; y < my; y++)); do
    echo "-> $UT/modul_x${x}_y${y}.stl"
    openscad -o "$UT/modul_x${x}_y${y}.stl" -D 'del="modul"' -D "modul_x=$x" -D "modul_y=$y" "$@" "$SCAD"
  done
done
echo "Ferdig. Filene ligger i $UT/ (ikke legg dem i git)."
