#!/usr/bin/env bash
# Lager en ny signeringsnøkkel for Android-appene (Homelab/FinansHub, Kalender og Wear) og viser hvilke fire
# GitHub-hemmeligheter som skal legges inn. Se docs/android-signering.md.
#
#   scripts/android-nokkel.sh [utmappe]     (standard: ~/homelab-android-nokkel)
#
# Passordet leses fra terminalen uten ekko. Det sendes til keytool via miljøet (ikke som argument, så det ikke synes i
# prosesslista) og skrives aldri til logg eller fil. Nøkkelfila og base64-fila får tilgang bare for deg (umask 077).
set -euo pipefail

ALIAS=homelab
UT="${1:-$HOME/homelab-android-nokkel}"
JKS="$UT/homelab-release.jks"
B64="$JKS.b64"

command -v keytool >/dev/null || { echo "Fant ikke keytool. Installer Java (JDK 17 eller nyere) først." >&2; exit 1; }
case "$(cd "$(dirname "$UT")" 2>/dev/null && pwd)/" in
  "$(git rev-parse --show-toplevel 2>/dev/null || echo /ingen-repo)"/*) echo "Velg en mappe utenfor repoet – nøkkelen skal aldri ligge i git." >&2; exit 1 ;;
esac
[ -e "$JKS" ] && { echo "$JKS finnes allerede. Flytt eller slett den først (mister du den, kan appene ikke oppdateres)." >&2; exit 1; }

umask 077
mkdir -p "$UT"

read -rsp "Velg passord for nøkkelen (minst 12 tegn): " PW; echo
[ "${#PW}" -ge 12 ] || { echo "Passordet er for kort." >&2; exit 1; }
read -rsp "Gjenta passordet: " PW2; echo
[ "$PW" = "$PW2" ] || { echo "Passordene er ikke like." >&2; exit 1; }
unset PW2
export ANDROID_NOKKEL_PW="$PW"
unset PW

keytool -genkeypair -keystore "$JKS" -storetype PKCS12 -alias "$ALIAS" -keyalg RSA -keysize 4096 -validity 10000 \
  -dname "CN=Homelab" -storepass:env ANDROID_NOKKEL_PW -keypass:env ANDROID_NOKKEL_PW >/dev/null

if base64 --help 2>&1 | grep -q -- '-w'; then base64 -w0 "$JKS" > "$B64"; else base64 -i "$JKS" | tr -d '\n' > "$B64"; fi

FP=$(keytool -list -v -keystore "$JKS" -alias "$ALIAS" -storepass:env ANDROID_NOKKEL_PW | sed -n 's/^[[:space:]]*SHA256: //p' | head -1)
unset ANDROID_NOKKEL_PW

cat <<TXT

Nøkkelen er laget: $JKS
Ta en sikkerhetskopi av den og passordet (passordhvelv). Mister du en av dem, kan appene ikke oppdateres uten avinstallering.

Legg inn fire hemmeligheter i GitHub → repoet → Settings → Secrets and variables → Actions → New repository secret:

  ANDROID_KEYSTORE_BASE64    innholdet i $B64
  ANDROID_KEYSTORE_PASSWORD  passordet du nettopp valgte
  ANDROID_KEY_ALIAS          $ALIAS
  ANDROID_KEY_PASSWORD       samme passord (PKCS12 bruker ett passord)

Med GitHub CLI (spør etter passordet selv, ingenting havner i historikken):
  gh secret set ANDROID_KEYSTORE_BASE64 < "$B64"
  gh secret set ANDROID_KEYSTORE_PASSWORD
  gh secret set ANDROID_KEY_ALIAS --body $ALIAS
  gh secret set ANDROID_KEY_PASSWORD

Slett $B64 når hemmelighetene er lagt inn.
SHA-256-fingeravtrykk (for ANDROID_CERT_SHA256 på serveren hvis du bruker App Links): ${FP:-ukjent}
TXT
