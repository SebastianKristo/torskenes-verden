#!/usr/bin/env bash
# Skjold Lab – eksporter alle printdeler til STL (krever openscad i PATH).
# Bruk: ./eksporter.sh [utmappe] [--led | --alle] [--variant hele_hylla|rundt_raaco] [ekstra -D-parametre ...]
#   ./eksporter.sh stl -D hylle_bredde=565 -D rad_avstand=44.2   (sorteringen uten LED, som før)
#   ./eksporter.sh stl --led                                     (bare LED-skapet, hele hylla, til stl/ledvegg/)
#   ./eksporter.sh stl --led --variant rundt_raaco -D led_per_skuff=4   (LED-vegg rundt Raaco)
#   ./eksporter.sh stl --alle                                    (begge modellene)
# --variant gjelder bare LED-modellen (standard hele_hylla). Hvilke LED-deler og moduler som
# lages, leses fra linjene SKJOLDLAB-MODUL og SKJOLDLAB-DEL i konsollen, så det følger parametrene.
# For sorteringen uten LED leses antall moduler, topphylle/store skuffer/bakkasser og om
# kasse L må deles fra ekkoet i modellen.
# Standardmålene er hylla 560 x 760 x 320 mm og Raaco 300 x 150 x 552 mm.
set -euo pipefail
cd "$(dirname "$0")"
SCAD=skjoldlab_tilleggsskap.scad
LEDSCAD=skjoldlab_ledvegg.scad
UT=${1:-stl}
shift || true
MODUS=gammel
VARIANT=hele_hylla
while (($#)); do
  case "$1" in
    --led) MODUS=led; shift ;;
    --alle) MODUS=alle; shift ;;
    --variant) VARIANT=${2:?"--variant trenger hele_hylla eller rundt_raaco"}; shift 2 ;;
    --variant=*) VARIANT=${1#--variant=}; shift ;;
    *) break ;;
  esac
done
case "$VARIANT" in hele_hylla | rundt_raaco) ;; *) echo "Ukjent --variant: $VARIANT (hele_hylla eller rundt_raaco)." >&2; exit 1 ;; esac
mkdir -p "$UT"
FEIL=() # deler som ikke lot seg eksportere (skriptet fortsetter og lister dem til slutt)
command -v openscad >/dev/null || { echo "Fant ikke openscad i PATH (se README.md)." >&2; exit 1; }

# Verdien til nøkkel $1 i en plan-linje $2 («nøkkel=verdi nøkkel=verdi ...»)
verdi() { sed -n "s/.* $1=\([^ ]*\).*/\1/p" <<<" $2" | head -1; }

# LED-skapet (skjoldlab_ledvegg.scad) – moduler og deler leses fra plan-linjene
eksporter_led() {
  local ut="$UT/ledvegg" tmp info linje navn d mx my sek topp_y=0
  local -a ekstra
  mkdir -p "$ut"
  tmp=$(mktemp -d)
  openscad -o "$tmp/info.echo" -D 'del="lask"' -D "variant=\"$VARIANT\"" "$@" "$LEDSCAD" >"$tmp/log" 2>&1 || true
  info=$(cat "$tmp/info.echo" "$tmp/log" 2>/dev/null | sed -n 's/.*\(SKJOLDLAB-[A-Z]*: .*\)"$/\1/p' | awk '!s[$0]++' || true)
  rm -rf "$tmp"
  echo "$info" | grep 'SKJOLDLAB-LED' || true
  if ! grep -q 'SKJOLDLAB-MODUL' <<<"$info"; then
    echo "Fant ingen SKJOLDLAB-MODUL-linjer fra $LEDSCAD (feil i parametrene?)." >&2
    FEIL+=("ledvegg/plan")
    return
  fi
  lagl() { # lagl <filnavn> <del> [ekstra -D ...]
    local navn=$1 d=$2; shift 2
    echo "-> $ut/$navn.stl"
    openscad -o "$ut/$navn.stl" -D "del=\"$d\"" -D "variant=\"$VARIANT\"" "$@" "$LEDSCAD" || FEIL+=("ledvegg/$navn")
  }
  # Øvrige deler (skuff, skuffplate, masker, lasker, elboks, Raaco-deler ...)
  while IFS= read -r linje; do
    linje=${linje#SKJOLDLAB-DEL: }
    navn=$(verdi navn "$linje"); d=$(verdi del "$linje"); mx=$(verdi modul_x "$linje"); sek=$(verdi seksjon "$linje")
    ekstra=()
    [[ -n $mx ]] && ekstra+=(-D "modul_x=$mx")
    [[ -n $sek ]] && ekstra+=(-D "seksjon=\"$sek\"")
    lagl "$navn" "$d" "${ekstra[@]}" "$@"
  done < <(grep '^SKJOLDLAB-DEL: ' <<<"$info")
  # Moduler (topp_modul får _y bare når toppveggen har flere etasjer, som før)
  grep '^SKJOLDLAB-MODUL: .* del=topp_modul .*modul_y=[1-9]' <<<"$info" >/dev/null && topp_y=1
  while IFS= read -r linje; do
    linje=${linje#SKJOLDLAB-MODUL: }
    d=$(verdi del "$linje"); mx=$(verdi modul_x "$linje"); my=$(verdi modul_y "$linje")
    if [[ $d == topp_modul && $topp_y == 0 ]]; then navn="topp_modul_x${mx}"; else navn="${d}_x${mx}_y${my}"; fi
    lagl "$navn" "$d" -D "modul_x=$mx" -D "modul_y=$my" "$@"
  done < <(grep '^SKJOLDLAB-MODUL: ' <<<"$info")
  echo "LED-skapet ($VARIANT) ligger i $ut/ (ikke legg filene i git)."
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
