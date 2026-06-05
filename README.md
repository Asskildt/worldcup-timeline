# fotball-vm — FIFA World Cup 2026 Schedule

A static Norwegian-focused website showing all 104 matches of FIFA World Cup 2026. Times in CEST, TV listings for Norwegian broadcasters (NRK/TV2), and Norway highlighted throughout.

**Live:** [fotballvm.asskildt.eu](https://fotballvm.asskildt.eu)

## Features

- **Timeline view** — horizontal day-by-day schedule
- **Table view** — full match list with rest-day toggle
- **Groups** — all 12 groups with live standings
- **KO bracket** — visual knockout tree from R32 to the final
- **Arena map** — SVG map of all 16 venues across North America
- **Favorites filter** — highlight your teams across all views, including potential KO paths
- **TV listings** — Norwegian broadcasters (NRK / TV 2) per match
- **Light / dark / system theme** — synced across `asskildt.eu` via `localStorage`
- **Match modal** — venue info, scorers, extra time, penalties
- **Live results** — fetched from openfootball at page load

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
| `node build.js` | `dist/` | Production build |
| `node build.js --test` | `dist-test/` | Test: 22 June, mid group stage |
| `node build.js --test=r32` | `dist-test/` | Test: 4 July, after R32 — Norway through |
| `node build.js --test=sf` | `dist-test/` | Test: 13 July, after QF — Norway out in R16 |
| `npm run watch` | `dist/` | Auto-rebuild on changes (requires nodemon) |

After any change in `src/`, build both: `node build.js --test && node build.js`

## Folder structure

```
fotball-vm/
├── src/
│   ├── data/
│   │   ├── matches.json            ← All 104 matches (KO uses position codes)
│   │   ├── matches-test-*.json     ← Test fixtures for each scenario
│   │   ├── teams.json              ← 48 teams
│   │   ├── stadiums.json           ← 16 venues
│   │   ├── playoff.json            ← Qualification matches
│   │   └── world.json              ← World map data
│   ├── flag-svgs/                  ← SVG flags (lipis/flag-icons, MIT)
│   ├── js/app.js                   ← All UI logic (~3000 lines)
│   ├── templates/index.html        ← HTML template
│   ├── partials/                   ← head, footer, theme-init snippets
│   └── style.css                   ← Design system + group colours + layout
├── dist/                           ← Generated (gitignored) — deployed to server
├── dist-test/                      ← Generated test build (gitignored)
├── build.js                        ← Build script
├── build-map.js                    ← Arena map SVG generator
└── package.json
```

## Data sources

- Match data from [openfootball/worldcup.json](https://github.com/openfootball/worldcup.json)
- Flag SVGs from [flag-icons by lipis](https://flagicons.lipis.dev/) (MIT license)

## Norwegian focus

This site is built for a Norwegian audience:

- All times shown in **CEST** (Central European Summer Time)
- TV listings show **NRK** and **TV 2** coverage
- Norway's matches are highlighted with a red left border
- UI language is **Norwegian**

## Tech stack

- Vanilla JS — no framework
- Vanilla CSS with custom properties
- Node.js build script — no bundler
- Static hosting (no server, no database)

## Contributing

See [agents.md](agents.md) for the full contributor and AI-agent guide.
