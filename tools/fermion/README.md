# fermion – Neutrino-1 8B og Phonon på Mac mini-en (prompt 53)

To valgfrie tjenester fra Fermion Research, på Mac mini-en i huset:

| Tjeneste | Hva | Adresse | LaunchAgent |
|---|---|---|---|
| Neutrino-1 8B | Tekstmodell (Qwen3-8B ternær, Apache-2.0, ~3,9 GB). Valgfri i Chat, aldri standard. | `http://10.69.1.173:8000` | `com.local.fermion-neutrino` |
| Phonon-2.5 | Tale→tekst med ordtider (CC-BY-4.0, ~160 MB). 25 språk, **ikke norsk**. | `http://10.69.1.173:8010` | `com.local.fermion-phonon` |

- Hver agent kjører `guard.py` (bare Python-standardbiblioteket), som starter `fermion serve` på `127.0.0.1` og bare slipper
  inn avsendere på tillatelseslista (standard `10.69.1.39` = Glimt-serveren) **med** riktig nøkkel (`Authorization: Bearer …`).
- Lytter bare på LAN-adressen. Skal **aldri** eksponeres via Cloudflare eller internett. Loggen har aldri nøkler eller innhold.
- Ikke Ollama: Neutrino krever fermion-runtime (`fermion serve`).

```bash
cd ~/git/torskenes-verden/tools/fermion
./install.sh                                   # begge tjenestene
./install.sh --cache-dir /Volumes/AI/fermion   # modellene på den eksterne disken
./install.sh --only neutrino                   # bare én (neutrino | phonon | begge)
./install.sh --rotate-key                      # ny nøkkel – legg den inn i Homelab etterpå
./uninstall.sh [--purge]
```

Full veiledning (Homelab-oppsett, test, minne, språk, lisenser): `docs/fermion-53.md`.
