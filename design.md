# Designsystem – fotballvm.asskildt.eu

## Visuell identitet

**Stil:** Retro-arcade møter sports-data. Inspirert av `asskildt.eu`: VT323-font for titler og scores gir en gammeldags resultattavle-følelse, glassmorphism-bakgrunner med `backdrop-filter: blur` gir dybde, og harde `box-shadow`-offset-skygger fra inspo-siden gir blocky, håndfast karakter. Informasjonstetthet er en styrke — designet trekker seg ikke tilbake, men rammer inn dataene.

**Tone:** Energisk og funksjonell. Siden er laget av en nordmann for nordmenn — Norge er alltid fremhevet.

---

## Fargepalett

### Mørk modus (standard)
Dyp nattblå bakgrunn, ikke ren svart. Hentet fra inspo-sidens natt-palett.

```css
:root {
    --bg:         #070B1D;   /* Nattblå — fra asskildt.eu night-palett */
    --bg-card:    rgba(7, 11, 29, 0.75);  /* Glassmorphism-overflate */
    --text:       #ffffff;
    --text-sec:   #94ACDC;   /* Sekundær — blålig grå */
    --muted:      #4a5a7a;
    --border:     #151F44;
    --border-mid: #1D2B59;
    --shadow:     #040714;   /* Hard offset-skygge */
    --norway:     #ef2b2d;   /* Norsk rød */
    --midnight:   #4a9eff;   /* Midnatt-markering i tidslinje */
}
```

### Lys modus
Lys blågrå bakgrunn (ikke hvit), glassmorphism-kort med hvit bakgrunn.

```css
[data-theme="light"] {
    --bg:         #e8edf8;
    --bg-card:    rgba(255, 255, 255, 0.75);
    --text:       #0a1f3a;
    --text-sec:   #2a4a6a;
    --muted:      #8a9ab8;
    --border:     #c0cce0;
    --border-mid: #a0b0cc;
    --shadow:     #8090b0;
}
```

### Gruppefarger
12 grupper (A–L) + KO-runder har egne `--grp-X-bg` / `--grp-X-fg` custom properties, fordelt rundt fargehjulet. Brukes via `.c-A` til `.c-FIN`. Alltid dempet — aldri mettet.

### Prinsipper
- Nattblå base, ikke ren svart — mer atmosfærisk
- Glassmorphism-overflater med `backdrop-filter: blur(8–16px)`
- Gruppefarger er eneste sterke aksenter
- Norsk rød (`#ef2b2d`) for Norge-markering
- Midnatt-blå (`#4a9eff`) for 00:00-linjen i tidslinjen

---

## Typografi

### Fonter
- **Titler / Scores / Seksjonslabels:** VT323 (monospace, retro-arcade)
- **Labels / Metadata / Tabs:** Space Mono (monospace, teknisk)
- **Body / Lagnavn:** Inter (sans-serif, lesbar)

```html
<link href="https://fonts.googleapis.com/css2?family=VT323&family=Space+Mono:wght@400;700&family=Inter:wght@400;500&display=swap" rel="stylesheet">
```

### Hierarki

| Element | Font | Størrelse | Effekt |
|---------|------|-----------|--------|
| Sidetittel | VT323 | 2.8rem | `text-shadow: 3px 3px 0 var(--border-mid)` |
| Seksjonslabel (tidslinje) | VT323 | 0.9rem | letter-spacing |
| Score (modal) | VT323 | 3rem | `text-shadow: 2px 2px 0 var(--border-mid)` |
| Score (tabell) | VT323 | 1.1rem | — |
| Score (tidslinje) | VT323 | 0.85rem | — |
| Gruppe-tittel | VT323 | 1.1rem | letter-spacing |
| Tab-knapper | Space Mono | 0.58rem | uppercase, letter-spacing |
| Dato / tid | Space Mono | 0.52–0.6rem | uppercase |
| Lagnavn | Inter | 0.8–0.82rem | normal |

### Regler
- VT323 brukes kun for tall, titler og seksjonslabels — aldri for løpende tekst
- Space Mono for all metadata, labels og koder
- Inter for lagnavn og beskrivende tekst
- Ingen kursiv

---

## Glassmorphism

Alle "kort"-overflater bruker glassmorphism:

```css
background: var(--bg-card);          /* rgba med alpha */
backdrop-filter: blur(8px);
-webkit-backdrop-filter: blur(8px);
border: 2px solid var(--border-mid);
```

Brukes på: header, tidslinje-wrap, tabell-wrap, gruppe-kort, modal.

---

## Box-shadow (inspo-stil)

Hard offset-skygge uten blur — direkte fra inspo-siden:

```css
/* Standard */
box-shadow: 4px 4px 0 var(--shadow);

/* Modal / fremhevet */
box-shadow: 6px 6px 0 var(--shadow);

/* Hover-effekt */
transform: translate(-2px, -2px);
box-shadow: 4px 4px 0 var(--shadow);
```

Brukes på: tidslinje-wrap, tabell-wrap, grupper-grid, modal, kamp-blokker, flagg-par.

---

## Animasjoner

### Innlasting
```css
.site-header { animation: fadeInDown 0.5s ease-out forwards; }
.tabs        { animation: fadeInUp 0.4s ease-out 0.1s both; }
footer       { animation: fadeIn 0.6s ease-out 0.3s both; }
.tab-panel.active { animation: fadeIn 0.25s ease-out; }
.modal       { animation: fadeInUp 0.2s ease-out; }
```

### Hover
```css
/* Kamp-blokker i tidslinje */
.tl-match:hover { transform: translate(-1px, -1px); box-shadow: 3px 3px 0 ...; }

/* Gruppe-kort */
.group-card:hover { transform: translate(-2px, -2px); box-shadow: 4px 4px 0 ...; }

/* Flagg-par (dagens stripe) */
.today-flag-pair:hover { transform: translate(-1px, -1px); }
```

### Prinsipper
- `cubic-bezier(0.175, 0.885, 0.32, 1.275)` — lett bounce, fra inspo
- Korte varigheter (0.15–0.5s)
- Ingen animasjoner som blokkerer interaksjon

---

## Komponenter

### Header (sticky)
Glassmorphism-bakgrunn, tre lag:
1. Tittel (VT323, stor) + "USA · Canada · Mexico" subtitle
2. Norge-banner med dynamisk nedtelling
3. Dagens flagg-stripe (vises kun på kampdager)

### Tidslinje
- Glassmorphism-wrap med hard box-shadow
- Tidssone-bakgrunnsstriper (svake fargede soner for UTC-7/−6/−5/−4)
- Kamp-blokker med hard 2px offset-skygge, hover løfter dem
- VT323 for scores i blokkene
- Midnatt markert med blå linje

### Tabell
- Glassmorphism-wrap
- VT323 for scores og seksjonslabels
- Norge-rader: `box-shadow: inset 3px 0 0 var(--norway)`

### Grupper
- Glassmorphism-kort med hover-løft
- VT323 for gruppe-titler
- Norge-lag: `box-shadow: inset 3px 0 0 var(--norway)`

### Modal
- Glassmorphism, `box-shadow: 6px 6px 0`
- VT323 for score (3rem) og "–" mellom lagene
- Åpner fra bunnen på mobil (sheet-stil)

### Tema-toggle (footer)
Diskret, liten — ikke fremtredende:
```css
.theme-toggle {
    background: none;
    border: 1px solid var(--border);
    font-size: .52rem;
    color: var(--muted);
}
```

---

## Responsivt design

### Breakpoints
- `max-width: 700px` — mobil
- `max-width: 400px` — smal mobil

### Mobil-tilpasninger
- Header-tittel skaleres ned (2.2rem → 1.9rem)
- Tabs: full bredde, ikoner skjules
- Tidslinje: scroll-hint vises, `min-width: 700px`
- Tabell: venue- og gruppe-kolonne skjules
- Grupper: 2 kolonner (1 på smal)
- Modal: åpner fra bunnen, full bredde

---

## Implementering i nye sider

```css
/* Minimal base */
:root {
    --bg: #070B1D;
    --bg-card: rgba(7, 11, 29, 0.75);
    --text: #ffffff;
    --text-sec: #94ACDC;
    --border-mid: #1D2B59;
    --shadow: #040714;
}

/* Glassmorphism-kort */
.card {
    background: var(--bg-card);
    border: 2px solid var(--border-mid);
    box-shadow: 4px 4px 0 var(--shadow);
    backdrop-filter: blur(8px);
}
.card:hover {
    transform: translate(-2px, -2px);
    box-shadow: 6px 6px 0 var(--shadow);
}

/* VT323 for titler */
.title { font-family: 'VT323', monospace; text-shadow: 3px 3px 0 var(--border-mid); }
```
