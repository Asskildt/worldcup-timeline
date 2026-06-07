# Utviklingsmønstre – fotball-vm

Konkrete oppskrifter for å legge til eller endre funksjonalitet. Se `agents.md` for prosjektoversikt og `design.md` for visuell stil.

---

## Legge til en ny fane

Fullstendig sjekkliste basert på "Rutenett"-fanen (juni 2026):

### 1. HTML-mal (`src/templates/index.html`)

Legg til tab-knapp i `.tabs`:
```html
<button class="tab" id="tab-navn" onclick="showTab('navn',this)">
    <i class="bi bi-ikon-her"></i> Etikett
</button>
```

Legg til view-panel (etter de andre view-panelene):
```html
<div id="view-navn" class="tab-panel">
    <div id="navn-toolbar"></div>
    <div class="navn-wrap" id="navn-wrap">
        <div class="navn-inner" id="navn"></div>
    </div>
</div>
```

### 2. `showTab()` (`src/js/app.js`)

Legg til `'navn'` i fane-arrayen:
```javascript
function showTab(name, btn) {
    ['timeline','table','groups','bracket','stats','arenas', 'navn'].forEach(n => { … });
```

Legg til `tabHash`-oppføring og lazy build-kall:
```javascript
const tabHash = { …, navn: '#url-slug' };
if (name === 'navn') buildNavn();
```

### 3. i18n (`src/js/app.js`)

Legg til i **begge** språkblokker i `i18n`-objektet:
```javascript
// no:
tab_navn: 'Etikett',

// en:
tab_navn: 'Label',
```

### 4. `applyLang()` (`src/js/app.js`)

Legg til i tab-array-ene slik at etiketten oppdateres ved språkbytte:
```javascript
const tabIds   = ['timeline','table',…, 'navn'];
const tabIcons = ['bi-bar-chart-steps','bi-list-ul',…, 'bi-ikon-her'];
const tabKeys  = ['tab_timeline','tab_grid','tab_table',…, 'tab_navn'];
```

Legg til rebuild-kall for å oppdatere oversatte strenger:
```javascript
if (document.getElementById('navn-built')) buildNavn();
// eller:
if (document.getElementById('navn')?.dataset.built) buildNavn();
```

### 5. Rebuild-hooks

Legg til betinget rebuild der disse tingene skjer:
- `setTZ()` — tidssonebytte
- `toggleHighlights()` — highlight-toggle
- `fetchResults()` — live-resultater lastet inn
- `setTeamFilter()`, `setGroupFilter()`, `setFavoritesFilter()`, `clearFilter()` — filter
- `window.addEventListener('resize', …)` — om fanen er bredde-sensitiv

Mønster:
```javascript
if (document.getElementById('navn')?.dataset.built) buildNavn();
```

### 6. `buildNavn()` — selve funksjonen

Sett en data-attributt så applyLang/hooks kan detektere om fanen er bygget:
```javascript
function buildNavn() {
    const el = document.getElementById('navn');
    if (!el) return;
    el.dataset.built = '1';
    el.innerHTML = '';
    // … bygg innhold
}
```

### 7. CSS (`src/style.css`)

Legg til CSS-klasser for den nye fanen på slutten av filen. Bruk prefiks (f.eks. `.vg-` for "vertical grid") for å unngå konflikter.

### 8. Bygg og verifiser

```bash
node build.js --test && node build.js
```

## "Ferdig"-logikk for kamper og dager

Bruk alltid de globale hjelperne — **aldri** beregn `MATCH_DUR * 3600000` direkte for past-sjekk:

```javascript
isDayPast(isoDate)  // true hvis alle kamper på dagen er ferdig + buffer
isMatchPast(m)      // true hvis én enkelt kamp er ferdig + buffer
```

Buffer er definert som `MATCH_END_BUFFER = 3.0` timer (kampvarighet 2t + 1t for ekstraomganger og forsinkede resultater). `MATCH_DUR * 3600000` brukes kun for LIVE-vinduet (kamp pågår), ikke for "er den ferdig".

---

## Transponer-modus (horisontal ↔ vertikal tidslinje)

Tidslinje og rutenett deler én fane (`view-timeline`). Modusen styres av `TL_MODE`:

```javascript
let TL_MODE = localStorage.getItem('tlMode') !== null
    ? localStorage.getItem('tlMode')
    : (window.innerWidth <= 700 ? 'vertical' : 'horizontal');
```

**Auto-detect ved første besøk:** mobil (≤700px) → vertikal, desktop → horisontal. Lagres i `localStorage` når brukeren aktivt bytter.

**`applyTlMode(mode?)`** — bytter mellom modusene, lagrer i localStorage, bygger riktig visning:
```javascript
applyTlMode('vertical');   // vis rutenett
applyTlMode('horizontal'); // vis tidslinje
applyTlMode();             // bruk gjeldende TL_MODE (ved oppstart)
```

**HTML-struktur:** `#tl-mode` og `#vg-mode` er to `<div>`-er i `view-timeline`, én er synlig om gangen.

**Transponer-knapp:** Inline SVG fra `src/transpose.svg` som `TRANSPOSE_SVG`-konstant. Vises i begge toolbars med `.on`-klasse når vertikal modus er aktiv.

**URL-deling:** `#rutenett`/`#grid` åpner tidslinje-fanen uten å endre modus — enheten bestemmer selv.

---

## Kompakt-tilstand

To uavhengige state-variabler, separate defaults:

```javascript
let TL_COMPACT = localStorage.getItem('tlCompact') !== null
    ? localStorage.getItem('tlCompact') === 'true'
    : false;  // horisontal: utvidet som default

let VG_COMPACT = localStorage.getItem('vgCompact') !== null
    ? localStorage.getItem('vgCompact') === 'true'
    : window.innerWidth <= 700;   // kompakt kun på mobil som default
```

- `TL_COMPACT = false` → tidslinjen viser by/TV-info under kamp-blokker
- `VG_COMPACT = true` → rutenett bruker FIFA-kode og smalere kolonner

Toggle-funksjoner: `toggleTlCompact()` og `toggleVgCompact()` — separate og uavhengige.

---

## URL-parametere

Leser `?lang=` og `?tz=` ved oppstart, lagrer til `localStorage`, og fjerner fra URL:

```
?lang=en          → setter språk til engelsk
?lang=no          → setter norsk
?tz=EDT           → setter tidssone (label-match, case-insensitive)
?tz=CEST          → setter CEST
```

IIFE `applyURLParams()` kjøres etter `LANG` er deklarert. Parameterne fjernes fra URL med `history.replaceState` — ren URL etter lasting.

Styrer **ikke** `TL_MODE` — enheten bestemmer modus uavhengig av URL.

---

## Sticky header-mønster for nye faner

**Horisontal visning (tidslinje):** Tids-aksen er utenfor `.tl-wrap` og sticky med `top: var(--header-h)`.

**Vertikal visning (rutenett):** Dato-raden (`vg-outer`) er sticky med `top: var(--header-h)`. Kun `.site-header`-høyden brukes — tabs og toolbar scroller bort og skal ikke medregnes.

`--header-h` settes av `updateHeaderHeight()` som måler `.site-header?.offsetHeight`. Kjøres ved load, resize og etter live-fetch.

HTML-struktur for visning med sticky header-rad:
```html
<div class="xxx-outer">          <!-- position: sticky; top: var(--header-h) -->
    <div class="xxx-corner"></div>          <!-- TZ-label, fast bredde -->
    <div class="xxx-header-scroll-wrap">    <!-- overflow: hidden, synkroniseres -->
        <div class="xxx-header-row"></div>  <!-- alle kolonneoverskrifter -->
    </div>
</div>
<div class="xxx-body-outer">
    <div class="xxx-axis-body-wrap"></div>  <!-- fast tids-akse -->
    <div class="xxx-wrap">                  <!-- overflow-x: auto -->
        <div class="xxx-inner" id="xxx"></div>
    </div>
</div>
```

Scroll-synkronisering (horisontalt):
```javascript
vgWrap.addEventListener('scroll', () => {
    hdrScrollWrap.scrollLeft = vgWrap.scrollLeft;
}, { passive: true });
```

---

## TV-data i testmodus (build.js)

Test-fixtures (`matches-test-*.json`) har ikke `tv`-feltet. `build.js` løser dette ved å lese TV-data fra `matches.json` og merge inn basert på `dato|lag1|lag2`-nøkkel:

```javascript
if (IS_TEST) {
    readJSON('matches.json').matches.forEach(m => {
        if (m.tv) tvLookup[`${m.date}|${m.team1}|${m.team2}`] = m.tv;
    });
}
const tv = m.tv || (IS_TEST ? tvLookup[key] : null);
```

---

## Hash-routing for nye faner

Nye faner må registreres i `openModalByHash()` sin `tabMap` i `app.js`, ellers vil direkte URL-navigasjon (f.eks. refresh på `#rutenett`) falle tilbake til tidslinjen:

```javascript
const tabMap = {
    '#tidslinje': 'timeline', '#tab-timeline': 'timeline',
    '#rutenett':  'grid',     '#tab-grid':     'grid',
    // …
};
```

Også legg til fane-ID i fallback-listen i samme funksjon:
```javascript
['timeline','grid','table','groups','bracket','stats','arenas'].forEach(n => { … });
```

---



Alle visninger som skal respektere filter og highlight må implementere dette selv — det er ingen sentralisert gjengivelse.

### State-variabler

```javascript
ACTIVE_FILTER   // null | { type: 'team'|'group'|'favorites', value: 'Norway'|'A' }
HIGHLIGHTS_ON   // boolean
FAVORITE_TEAMS  // string[] — lagnavn
```

### matchesFilter-mønster

Kopier dette inn i `buildNavn()`:
```javascript
function matchesFilter(m) {
    if (!ACTIVE_FILTER) return true;
    if (ACTIVE_FILTER.type === 'team')      return m.team1 === ACTIVE_FILTER.value || m.team2 === ACTIVE_FILTER.value;
    if (ACTIVE_FILTER.type === 'group')     return m.grp === ACTIVE_FILTER.value;
    if (ACTIVE_FILTER.type === 'favorites') return FAVORITE_TEAMS.some(f => m.team1 === f || m.team2 === f);
    return true;
}
```

### Potensielle KO-kamper

For å vise potensielle KO-vei-kamper (der laget *kan* spille): bruk `getTeamBracketPaths(teamName)` som returnerer `Map<num, { match, via }>`. Se `buildVerticalGrid()` eller `buildTimeline()` for full implementering av `activeBracketPaths` / `activePotentialNums`.

### Verktøylinje

Filteret har sin egen `tl-filter-menu` per visning. Bruk `tl-toolbar`-klassen (definert i `style.css`) for konsistent utseende. Se `renderTlToolbar()` for referanseimplementering.

Eget filter-meny-par per visning (ikke delt):
- `toggleXxxFilterMenu()` / `closeXxxFilterMenu()`
- Filter-meny-ID: `xxx-filter-menu`, toggle-ID: `xxx-filter-toggle`

Filter-knapper i menyen kaller `setTeamFilter()` / `setGroupFilter()` etc. og deretter `buildNavn()`.

---

## Tidssone-konvertering

All tid internt er lagret som desimaltime i **CEST** (UTC+2). Hjelpefunksjoner:

```javascript
toLocalT(cestT)         // CEST-desimaltime → lokal desimaltime
fmtT(localT)            // desimaltime → "HH:MM"-streng
cestToDate(iso, cestT)  // isoDate + CEST-t → Date-objekt
currentTZ()             // returnerer gjeldende TZ_LIST-oppføring { offset, label, … }
```

Matcher med `t >= 24` er neste kalenderdag i CEST (f.eks. `t=25.5` = 01:30 neste dag).

---

## i18n — legge til nye strenger

1. Legg til nøkkel i **begge** `no` og `en`-blokkene i `i18n`-objektet (ca. linje 183 i `app.js`).
2. Bruk `t('nøkkel')` i koden.
3. Nøkler kan være funksjoner: `rest_days: (n) => \`— ${n} dager —\``

Lagnavn-oversettelse: legg til `name_no` (el. `name_xx`) per lag i `teams.json`, deretter returneres det automatisk av `teamName(name)` basert på `LANG`.

---

## Legge til et nytt språk (fullstendig guide)

Eksempel: legge til tysk (`de`). Alle steg må gjøres for å få korrekt embed-preview og URL-deling.

### 1. i18n-blokk i `app.js`
Kopier `en`-blokken og oversett alle ~120 strenger, inkl. tab-nøkler (`tab_timeline` osv.).

### 2. Lagnavn i `teams.json`
Legg til `name_de` per lag. `teamName()` i `app.js` returnerer det automatisk når `LANG === 'de'` — legg til et `if (LANG === 'de') return td.name_de || name;`-ledd.

### 3. Språkvelger i `toggleLangMenu()`
```javascript
const LANGS = [
    { code: 'no', label: 'NO', flag: 'no',    name: 'Norsk'   },
    { code: 'en', label: 'EN', flag: 'gb-eng', name: 'English' },
    { code: 'de', label: 'DE', flag: 'de',     name: 'Deutsch' },
];
```

### 4. `detectLang()` — auto-detect
```javascript
if (code === 'de') return 'de';
```

### 5. `buildShareURL()` — riktig URL ved deling
```javascript
const base = lang === 'en' ? origin + '/en/'
           : lang === 'de' ? origin + '/de/'
           : origin + '/';
// Norsk trenger ikke lang-parameter i URL — /de/ setter det via localStorage i head
if (lang !== 'en' && lang !== 'de') params.set('lang', lang);
```

### 6. Tab-hashes i `showTab()`
Legg til `tabHashDe`-objekt og bruk det når `LANG === 'de'`.

### 7. `src/partials/head-de.html`
Kopier `head-en.html`, oppdater:
- `<html lang="de">` (via `{{lang}}`-placeholder i template)
- Oversett `<title>` og `<meta description>`
- `og:locale="de_DE"`, `og:url` → `/de/`, `canonical` → `/de/`
- Legg til `hreflang="de"` i alle tre head-filer (`head.html`, `head-en.html`, `head-de.html`)
- `localStorage.setItem('lang','de')` i inline script

### 8. Build
```bash
node build.js && node build.js --lang=en && node build.js --lang=de
```
Produserer `dist/de/index.html` med tyske meta-tags. `data.js` og `app.js` kopieres fra base.

---

## Legge til nytt flagg

1. Last ned SVG fra [flagicons.lipis.dev](https://flagicons.lipis.dev)
2. Legg filen i `src/flag-svgs/{cc}.svg` (ISO 3166-1 alpha-2, f.eks. `no.svg`)
3. Bygg — `build.js` genererer `flags.svg`-sprit automatisk
4. Bruk i HTML: `<svg class="flag-svg"><use href="#no"/></svg>`

---

## Implementerte visninger

| Visning | Funksjon | Lazy? | Rebuild ved TZ? | Hash |
|---------|----------|-------|-----------------|------|
| Tidslinje (horisontal) | `buildTimeline()` | Nei (alltid) | Ja | `#tidslinje` / `#timeline` |
| Rutenett (vertikal) | `buildVerticalGrid()` | Ja | Ja | `#rutenett` / `#grid` (→ tidslinje i vertikal modus) |
| Tabell | `buildTable()` | Nei (alltid) | Ja | `#kamper` / `#table` |
| Grupper | `buildGroups()` | Nei (alltid) | Nei | `#grupper` / `#groups` |
| KO-bracket | `buildBracket()` | Ja | Nei | `#sluttspill` / `#bracket` |
| Arenaer | `buildArenas()` | Ja | Nei | `#arenaer` / `#venues` |
| Statistikk | `buildStats()` | Ja | Nei | `#statistikk` / `#stats` |

**Merk:** Tidslinje og rutenett deler `view-timeline`-panelet. `TL_MODE` (`horizontal`/`vertical`) styrer hvilken som vises. Se seksjonen om transponer-modus.

### Kompakt-modus-mønster

Rutenett-fanen har en kompakt-modus (FIFA-kode i stedet for lagnavn, smalere kolonner). Mønster som kan gjenbrukes:

```javascript
// State — lagres i localStorage
let VG_COMPACT = localStorage.getItem('vgCompact') !== 'false';
function saveVgCompact() { localStorage.setItem('vgCompact', String(VG_COMPACT)); }
function toggleVgCompact() { VG_COMPACT = !VG_COMPACT; saveVgCompact(); buildVerticalGrid(); }

// I bygge-funksjonen — bruk FIFA-kode i kompakt modus
const fifa1 = TEAMS[m.team1]?.code || m.team1.slice(0, 3).toUpperCase();
const name1 = VG_COMPACT ? fifa1 : teamName(m.team1);

// I toolbar — toggle-knapp med samme stil som tidslinjen
`<button class="tl-highlight-toggle${VG_COMPACT ? ' on' : ''}" onclick="toggleVgCompact()">
    <i class="bi bi-layout-text-sidebar-reverse"></i>
</button>`
```

---

## Tilpasse for et annet land / turnering

### Tidssone-base

All tid er CEST (UTC+2). For å endre:
- `utcToCEST()` i `build.js` — gi nytt navn og oppdater UTC-offset
- `fmtT()` i `app.js` — "CEST"-labelen er hardkodet i modal
- `TL_START` / `TL_END` i `app.js` — juster tidsvinduet ved behov
- `timezone`-feltet i `stadiums.json` — allerede relativt til UTC

### TV-kanaler

`"tv"`-feltet i `matches.json` er norsk (NRK / TV2). Farger via `.tc-tv-nrk` / `.tc-tv-tv2` i `style.css` — legg til nye klasser for andre kanaler.

### Fremhevet lag

Norge er hardkodet flere steder i `app.js`. Søk på `'Norway'` og erstatt. Se `agents.md` for fullstendig liste.

### Ny turneringsstruktur

KO-bracketen er hardkodet for 48-lag VM (R32 → R16 → QF → SF → FIN). For annet format: oppdater `buildBracket()` og kampnummer-arrayene.
