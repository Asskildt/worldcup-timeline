# fotball-vm — FIFA World Cup 2026 Schedule

A static website showing all 104 matches of FIFA World Cup 2026. Norwegian-focused with CEST times and NRK/TV2 listings, but with full English support.

**Live:** [fotballvm.asskildt.eu](https://fotballvm.asskildt.eu) · **English:** [fotballvm.asskildt.eu/en/](https://fotballvm.asskildt.eu/en/)

## Features

- **Timeline / Grid** — one tab, two layouts. Toggle with the ⇄ button.
  - Horizontal: day rows, time axis, match blocks (desktop default)
  - Vertical: date columns, time rows (mobile default, compact FIFA-code mode)
- **Table** — full match list with rest-day toggle
- **Groups** — all 12 groups with live standings
- **KO bracket** — visual knockout tree from R32 to the final
- **Arena map** — SVG map of all 16 venues across North America
- **Favorites filter** — highlight teams across all views, including potential KO paths
- **TV listings** — NRK / TV 2 per match
- **Live results** — fetched from openfootball at page load
- **Match modal** — venue info, scorers, extra time, penalties
- **Light / dark / system theme** — synced across `asskildt.eu`
- **Timezone selector** — 9 timezones, auto-detected from browser
- **Language selector** — Norwegian and English, auto-detected
- **URL parameters** — `?lang=en&tz=EDT` override language and timezone
- **Share modal** — builds shareable URL with correct language, timezone and tab

## Getting started

```bash
git clone git@github.com:Asskildt/worldcup-timeline.git
cd worldcup-timeline
npm install
node build.js
open dist/index.html
```

## Build commands

| Command | Output | Description |
|---------|--------|-------------|
| `node build.js` | `dist/` | Production build (Norwegian) |
| `node build.js --lang=en` | `dist/en/` | English build — run after base |
| `node build.js --test` | `dist-test/` | Test: 22 June, mid group stage |
| `node build.js --test=r32` | `dist-test/` | Test: 4 July, after R32 — Norway through |
| `node build.js --test=sf` | `dist-test/` | Test: 13 July, after QF — Norway out in R16 |
| `npm run watch` | `dist/` | Auto-rebuild on changes (requires nodemon) |

**After any change in `src/`:**
```bash
node build.js --test && node build.js && node build.js --lang=en
```

The English build must run after the base build (it reuses `dist/data.js`).

## Folder structure

```
fotball-vm/
├── src/
│   ├── data/
│   │   ├── matches.json            ← All 104 matches (KO uses position codes)
│   │   ├── matches-test-*.json     ← Test fixtures for each scenario
│   │   ├── teams.json              ← 48 teams with name_no translations
│   │   ├── stadiums.json           ← 16 venues
│   │   ├── playoff.json            ← Qualification matches
│   │   └── world.json              ← World map data
│   ├── flag-svgs/                  ← SVG flags (lipis/flag-icons, MIT)
│   ├── js/app.js                   ← All UI logic (~4000 lines)
│   ├── templates/index.html        ← HTML template with {{placeholders}}
│   ├── partials/
│   │   ├── head.html               ← Norwegian head (meta, OG, hreflang)
│   │   ├── head-en.html            ← English head (og:locale=en_US, /en/ canonical)
│   │   ├── footer.html
│   │   └── theme-init.html
│   ├── transpose.svg               ← Transpose icon for mode toggle
│   └── style.css                   ← Design system + group colours + layout
├── dist/                           ← Generated (gitignored) — deployed to server
│   └── en/                         ← English build (gitignored)
├── dist-test/                      ← Generated test build (gitignored)
├── build.js                        ← Build script (supports --lang=XX)
├── build-map.js                    ← Arena map SVG generator
├── agents.md                       ← Full project guide for contributors and AI agents
├── dev-patterns.md                 ← Implementation patterns and how-tos
├── design.md                       ← Design system documentation
└── roadmap.md                      ← Development roadmap
```

## Data sources

- Match data from [openfootball/worldcup.json](https://github.com/openfootball/worldcup.json)
- Flag SVGs from [flag-icons by lipis](https://flagicons.lipis.dev/) (MIT license)

## Inspiration

- [Ben Crellin (@BenCrellin)](https://x.com/BenCrellin/status/2039283939622175187) — his World Cup schedule spreadsheet (dates as rows, kick-off times as columns) directly inspired the vertical grid view in this project.

## Tech stack

- Vanilla JS — no framework
- Vanilla CSS with custom properties
- Node.js build script — no bundler
- Static hosting (no server, no database)

## Contributing

See [agents.md](agents.md) for the full contributor and AI-agent guide, and [dev-patterns.md](dev-patterns.md) for implementation patterns.
