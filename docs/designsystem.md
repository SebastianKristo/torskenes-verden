# Designsystem – tokens

Alle designverdier i Homelab (farger, skrift, avstander, radier, skygger, lag og bevegelse) har én kilde:
**`shared/design/tokens.json`**. Et skript genererer plattformkoden fra den, så web, iOS og Android får de samme verdiene.

> **Regelen:** aldri hex, px-størrelser eller egne skalaer i komponentkode. Finnes ikke verdien som token, legg til et token.

Tokenene er i bruk på alle plattformene: web lenker inn `tokens.css` først i `app.html` og i Økonomi, iOS og Mac bruker `DS`
(også Kalender-appene og widgetene), og Android bruker `HomelabTheme`, som bygger på `DsTheme`. Farger som fortsatt er faste i
koden, er merket `TODO(token)` til et token finnes.

## Hva er et token?

Et token er et **semantisk navn** på en designverdi: hva verdien brukes til, ikke hvordan den ser ut.
`textSecondary` er riktig, `grey500` eller `c5c5850` er feil (testen avviser slike navn).
Da kan verdien endres ett sted, og mørk modus, glass og økt kontrast får hver sin verdi uten at komponentene endres.

## Stil × modus

| | Lys | Mørk |
|---|---|---|
| **Papir** | `papir.lys` | `papir.mork` |
| **Glass** («cur», mørkt glass over bakgrunnsbildet) | peker til `papir.lys` (Q13) | `glass.mork` |

- **Stil** er et appvalg (Papir eller Glass). **Modus** følger systemet eller brukerens valg (lys/mørk/system).
- Glass har bare mørk modus i dag (Q13). `glass.lys` er et alias (`"$alias": "papir.lys"`), så lys modus i glass gir lyst papir.
- Økonomi følger Homelabs stil og modus (Q15): `mork` = Papir mørk, `glod` = Glass. Kalender på web følger også Homelab-modusen (Q14).
- Fargene `textSecondary`, `textTertiary` og `line` har egne verdier ved **økt kontrast** (`highContrast`).

## Fargetokens

| Token | Papir lys | Papir mørk | Glass mørk | Brukes til |
|---|---|---|---|---|
| `surface` | `#f3efe6` | `#16140f` | `#07080b` | Sidebunn |
| `surfaceRaised` | `#fffdf8` | `#211e18` | `rgba(40,44,52,0.55)` | Kort, ark, menyer (glass: med uskarphet) |
| `surfaceSunken` | `#ebe5d8` | `#1b1a17` | `rgba(255,255,255,0.06)` | Felt, brønner, valgt rad |
| `line` | `#d8d1c2` | `#3a352c` | `rgba(255,255,255,0.12)` | Skillelinjer og rammer |
| `textPrimary` | `#1b1a17` | `#f3efe6` | `#eef0f4` | Brødtekst og titler |
| `textSecondary` | `#5c5850` | `#a39d90` | `#8a93a6` | Undertekst, metadata (≥ 4.5:1) |
| `textTertiary` | `#8f897c` | `#8a8478` | `#6e6e78` | **Bare stor tekst** (≥ 18 px, eller 14 px fet) og dekor (≥ 3:1) |
| `accent` | `#b23a2a` | `#ec7a64` | `#ff7a3d` | Primærknapp, lenker, valgt tilstand |
| `onAccent` | `#ffffff` | `#1b1a17` | `#1b1a17` | Tekst og ikon på `accent` |
| `success` | `#2f7a4f` | `#6fbf8f` | `#6fbf8f` | OK, betalt, positive tall |
| `onSuccess` | `#ffffff` | `#1b1a17` | `#1b1a17` | Tekst på `success`-fyll |
| `warning` | `#a8661a` | `#e0a24a` | `#e0a24a` | Advarsel, snart forfall |
| `onWarning` | `#ffffff` | `#1b1a17` | `#1b1a17` | Tekst på `warning`-fyll |
| `danger` | `#b23a2a` | `#f59a8f` | `#f59a8f` | Feil, slett, negative tall |
| `onDanger` | `#ffffff` | `#1b1a17` | `#1b1a17` | Tekst på `danger`-fyll |
| `focus` | `#1b1a17` | `#ec7a64` | `#a8d4fb` | Fokusring (tastatur) |
| `scrim` | `rgba(0,0,0,0.35)` | `rgba(0,0,0,0.5)` | `rgba(0,0,0,0.5)` | Bak ark og dialoger |
| `surfaceField` | `#ffffff` | `#1c1a15` | `#0b0e15` | Inndatafelt (tekst, søk, valg) |
| `surfaceChip` | `#ece6da` | `#2a261f` | `rgba(255,255,255,0.08)` | Brikker, segmentvalg, hover på rader |
| `surfaceOverlay` | `#fffdf8` | `#211e18` | `rgba(18,25,38,0.86)` | Ark, menyer og dialoger (glass: tettere enn `surfaceRaised`, så teksten kan leses over bildet) |
| `lineSubtle` | `#e3ddcf` | `#3a352c` | `#1f2736` | Svake skillelinjer inne i kort og lister |
| `info` | `#2b5d8a` | `#a8d4fb` | `#a8d4fb` | Informasjon, lenker i glass, «pågår» |
| `onInfo` | `#ffffff` | `#1b1a17` | `#1b1a17` | Tekst og ikon på `info`-fyll |
| `successSoft` | `#e3eee5` | `rgba(111,191,143,0.16)` | `rgba(111,191,143,0.16)` | Svakt fyll bak OK-brikker (tekst: `textPrimary` eller `success`) |
| `warningSoft` | `#f4e8cf` | `rgba(224,168,90,0.16)` | `rgba(224,168,90,0.16)` | Svakt fyll bak advarsler |
| `dangerSoft` | `#f6dfd8` | `rgba(236,122,100,0.16)` | `rgba(236,122,100,0.16)` | Svakt fyll bak feil og «slett» |

Merk: `warning` i Papir lys har 4,0:1 mot `surface`. Bruk den som ikon, fyll (med `onWarning`) eller stor tekst, ikke som liten tekst.

### Kategorifarger

Fyllfarger for moduler, abonnementskategorier og kalendere, med `onCategory` (`#ffffff`) som tekst og ikon oppå.
På en farge brukeren har valgt selv (f.eks. per nyhetskilde) velger klienten `onCategory` eller `onCategoryLight` (`#000000`) etter
bakgrunnens luminans (web: `public/js/lib/kontrast.js`). Den beste av hvit og svart gir alltid minst 4,58:1 (M9).
Like i alle stiler og moduser. Hentet fra dashbordkortene (`--wc` i web40.css). Energi-oransjen `#d98c1f` (2,7:1 mot hvitt) er byttet med `amber`.

| Token | Verdi | `onCategory` |
|---|---|---|
| `category.blue` | `#2b5d8a` | 6,92:1 |
| `category.red` | `#d4231b` | 5,18:1 |
| `category.purple` | `#6b4fa0` | 6,46:1 |
| `category.green` | `#2f7a4f` | 5,23:1 |
| `category.teal` | `#1f7a6e` | 5,16:1 |
| `category.pink` | `#c2477a` | 4,69:1 |
| `category.amber` | `#a8661a` | 4,58:1 |
| `category.brown` | `#8a6a3a` | 5,00:1 |
| `category.neutral` | `#55524d` | 7,78:1 |

## Andre tokens

| Gruppe | Navn og verdier |
|---|---|
| Tekststiler (`textStyle`) | `caption` 11/14 · `footnote` 12/16 · `subheadline` 13/18 · `callout` 14/20 · `body` 16/24 · `headline` 18/24 (600) · `title3` 22/28 (600) · `title2` 28/34 (700) · `largeTitle` 44/52 (700) (størrelse/linjehøyde) |
| Vekter (`font.weight`) | `regular` 400 · `medium` 500 · `semibold` 600 · `bold` 700 |
| Familier (`font.family`, bare web) | Papir: Manrope, Newsreader, IBM Plex Mono. Glass: Outfit, Newsreader, JetBrains Mono. iOS og Android bruker systemfonten |
| Avstand (`space`) | `xs` 4 · `sm` 8 · `md` 12 · `lg` 16 · `xl` 24 · `xxl` 32 |
| Radius (`radius`) | `sm` 8 · `md` 12 · `lg` 16 · `xl` 20 · `full` 999 |
| Skygge (`shadow`) | `low` · `mid` · `high` (y, blur, alfa; elevation på Android) |
| Lag (`z`) | `base` 0 · `raised` 10 · `sticky` 100 · `nav` 200 · `sheet` 300 · `toast` 400 |
| Bevegelse (`motion`) | `fast` 150 ms · `normal` 250 ms · `slow` 400 ms, easing `standard`/`enter`/`exit`. Ved «Reduser bevegelse» er alle 0 |

## Slik brukes de

**Web** (`public/css/tokens.css`, prefiks `--ds-`):

```css
.kort { background: var(--ds-surface-raised); color: var(--ds-text-primary); border-radius: var(--ds-radius-lg);
        padding: var(--ds-space-lg); font-size: var(--ds-text-body-size); transition: opacity var(--ds-motion-fast) var(--ds-ease-standard); }
```

Verdiene velges av attributtene som allerede settes på `<html>` (av `hl-boot.js`, `hltheme.js`, `mode.js` og Økonomi), uten ny JS:

| Selektor | Gir |
|---|---|
| `:root`, `[data-hl="2c"]`, `[data-theme="lys"]` | Papir lys |
| `[data-hl="2c"][data-mode="dark"]`, `[data-theme="mork"]` | Papir mørk |
| `[data-kal-app]` + `prefers-color-scheme: dark` | Papir mørk (Kalender.app følger systemet) |
| `[data-hl="cur"]`, `[data-theme="glod"]` | Glass mørk (data-mode ignoreres, Q13) |
| `prefers-contrast: more` | Økt kontrast |
| `prefers-reduced-motion: reduce` | Varigheter 0 ms |

`data-kal-theme` (Kalenders eget lys/mørk) er ikke med: etter Q14 skal Kalender følge felles stil og modus.

**iOS og Mac** (`apps/ios/Shared/DesignTokens.swift` + `DesignTokens.xcassets`, med i FinansHub, FinansHubWidgets, Kalender, KalenderWidgets, KalenderMac og KalenderMacWidgets):

```swift
Text("Saldo")
    .font(.ds(.headline))                                   // systemfont, Dynamic Type
    .foregroundStyle(DS.color(.textPrimary, stil: .papir))
    .padding(DS.Space.lg)
    .background(DSFyll(.surfaceRaised), in: .rect(cornerRadius: DS.Radius.lg))   // stil fra \.dsStil
    .environment(\.dsStil, .glass)
```

Fargesettene heter `DS<Stil><Token>` (f.eks. `DSPapirSurface`, `DSGlassSurface`) og har Any (lys), Dark og High Contrast.
Modus følger `colorScheme`; stilen velges i kode. `Font.ds(_:custom:)` gir en egen font (f.eks. Manrope) i tokenstørrelsen med `relativeTo:`.
`DS.Motion.animation(DS.Motion.fast, reduce: reduceMotion)` gir `nil` når «Reduser bevegelse» er på. Med fargesettene følger
fargene også «Øk kontrast». Ikoner er SF Symbols (ikke tekstglyfer som «›» og «✕»), og trykkflater er minst 44 × 44 pt.

**Android** (`ui/designsystem/DesignTokens.kt` i `app`, `kalender` og `wear`):

```kotlin
DsTheme(stil = DsStil.Papir) {               // MaterialTheme + LocalDsColors, mørk følger systemet
    val ds = LocalDsColors.current
    Text("Saldo", style = MaterialTheme.typography.titleMedium, color = ds.textPrimary,
        modifier = Modifier.background(ds.category.green).padding(DsSpace.lg))
}
```

`DsSchemes` har M3-skjemaene (`lightColorScheme`/`darkColorScheme`) for Papir og Glass; flater med alfa er lagt over `surface`
så ark blir ugjennomsiktige. Dynamic color brukes ikke (Q16). `DsPalette` har alle semantiske farger, også de M3 mangler
(`success`, `warning`, `category` …). Wear har ikke Material 3 og får `DsWearColors` (Wear Compose Material) i stedet.

Skjermene i `app` leser fra `HomelabTheme` (`ui/designsystem/HomelabTheme.kt`): `HomelabTheme.colors`, `.space`, `.radius`,
`HomelabType` og `HomelabTypography`. Kalender-appen har `KTok`/`KType`, som er bygget av de samme tokenene. Tabellen fra gamle
farge- og skriftnavn til roller står i [utvikling.md](utvikling.md#android-felles-moduler-tema-og-skall). Ikoner er
`Icon(Icons.…)` med `contentDescription`, og trykkflater er minst 48 dp.

## Felles UI-komponenter på web

`public/js/ui/` har én fil per komponent, med stilene i `public/css/components/ui.css` (bare `--ds-*`, ingen hex, ingen `!important`):

| Fil | Gir | Klasse |
|---|---|---|
| `card.js` | `cardHtml({ title, sub, body })` | `.ui-card` |
| `button.js` | `buttonHtml(tekst, { variant: 'primary' \| 'danger' \| 'quiet', type, attrs })` | `.ui-btn` |
| `sheet.js` | `sheetHtml(…)` og `openSheet({ title, text, body, foot, tag }, onClose)` (Esc, klikk utenfor og `[data-ui-close]` lukker) | `.ui-scrim`, `.ui-sheet` |
| `empty.js` | `emptyHtml({ title, text, action })` | `.ui-empty` |
| `loader.js` | `loaderHtml(tekst)` | `.ui-loader` |
| `toast.js` | `toast(tekst, { tone: 'success' \| 'danger', ms })` | `.ui-toast` |

Nye skjermer bruker disse i stedet for egne klasser. `test/ui-komponenter.test.js` sjekker HTML-en og at `ui.css` bare bruker tokens.

## Legge til eller endre et token

1. Rediger `shared/design/tokens.json`. En ny farge må finnes i **alle** stiler og moduser (glass.lys arver fra papir.lys).
   Nye fargenavn legges også i listen `FARGER` øverst i `scripts/design-tokens.mjs`.
2. Kjør `npm run tokens`. Det skriver `public/css/tokens.css`, `apps/ios/Shared/DesignTokens.swift`, fargesettene i
   `apps/ios/Shared/DesignTokens.xcassets` og de tre `DesignTokens.kt`. Fargesett for tokens som er fjernet, slettes.
3. Kjør `npm test`. `test/design-tokens.test.js` sjekker at
   - de genererte filene stemmer med `tokens.json`,
   - nøklene er semantiske,
   - kontrasten holder: `textPrimary`/`textSecondary` ≥ 4,5:1 og `textTertiary` ≥ 3:1 mot `surface` og `surfaceRaised`,
     `on*` ≥ 4,5:1 mot fyllet sitt, `focus` og statusfarger ≥ 3:1 mot `surface`, kategorifarger ≥ 4,5:1 mot `onCategory`,
   - tabellen over i denne fila har samme fargeverdier.
4. Oppdater tabellene i denne fila hvis du endret en verdi.
5. Commit `tokens.json` og de genererte filene sammen.

Generert kode redigeres aldri for hånd. `npm run tokens:check` (også et steg i workflowen «Docker-image») feiler når noen har glemt å generere.

Verdier er `#rrggbb` eller `rgba(r,g,b,a)`. Nøkler som begynner med `$` er kommentarer.
