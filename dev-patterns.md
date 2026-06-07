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
    ['timeline','grid','table','groups','bracket','stats','arenas', 'navn'].forEach(n => { … });
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
const tabIds   = ['timeline','grid','table',…, 'navn'];
const tabIcons = ['bi-bar-chart-steps','bi-calendar3',…, 'bi-ikon-her'];
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

## Legge til nytt flagg

1. Last ned SVG fra [flagicons.lipis.dev](https://flagicons.lipis.dev)
2. Legg filen i `src/flag-svgs/{cc}.svg` (ISO 3166-1 alpha-2, f.eks. `no.svg`)
3. Bygg — `build.js` genererer `flags.svg`-sprit automatisk
4. Bruk i HTML: `<svg class="flag-svg"><use href="#no"/></svg>`

---

## Implementerte visninger

| Visning | Funksjon | Lazy? | Rebuild ved TZ? | Hash |
|---------|----------|-------|-----------------|------|
| Tidslinje (horisontal) | `buildTimeline()` | Nei (alltid) | Ja | `#tidslinje` |
| Rutenett (vertikal) | `buildVerticalGrid()` | Ja | Ja | `#rutenett` |
| Tabell | `buildTable()` | Nei (alltid) | Ja | `#kamper` |
| Grupper | `buildGroups()` | Nei (alltid) | Nei | `#grupper` |
| KO-bracket | `buildBracket()` | Ja | Nei | `#sluttspill` |
| Arenaer | `buildArenas()` | Ja | Nei | `#arenaer` |
| Statistikk | `buildStats()` | Ja | Nei | `#statistikk` |

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
