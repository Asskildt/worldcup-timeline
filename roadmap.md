# Roadmap – em28.asskildt.eu

## Nåsituasjon (august 2026)

Prosjektet er omlagt fra FIFA VM 2026 til UEFA EM 2028. Siden dekker hele veien til EM: Nations League → Kvalifisering → Sluttspill.

**Implementert:**
- Nations League-fane med League A-grupper og kamper (Gruppe A4: Portugal, Danmark, Norge, Wales)
- Kvalifisering-fane med formatforklaring, play-off-info og vertsnasjon-regler
- EM 2028-faner (under «Mer»): tidslinje, tabell, grupper, sluttspill, arenaer — med posisjonskoder
- Arena-kart (UK & Ireland, 9 arenaer)
- Tema-toggle, tidssone-velger, språkvalg (NO/EN)
- Favoritter-filter og Norge-highlighting
- Kamp-deling med OG-tags per kamp

---

## Tidslinje og milepæler

| Dato | Hendelse | Oppgave |
|------|----------|---------|
| **Sep 2026** | Nations League starter | Oppdatere resultater etter hver spilledag |
| **Nov 2026** | NL gruppespill ferdig | Oppdatere sluttstandinger, vise kvartfinale-oppsettet |
| **6. des 2026** | EM-kvaliktrekning (Belfast) | Populere qualifying.json med grupper og lag |
| **Mar 2027** | NL kvartfinaler + kvalik starter | Oppdatere NL-bracket, begynne kvalik-resultater |
| **Jun 2027** | NL Final Four | Vise NL-finaler |
| **Nov 2027** | Kvalik ferdig | Oppdatere sluttstandinger, vise play-off-oppsett |
| **Des 2027** | EM-trekning | Erstatte posisjonskoder med lag i matches.json |
| **Mar 2028** | EM play-off | Siste lag bekreftet |
| **Jun 2028** | EM 2028 starter | Aktivere live-visning, flytte EM-faner til primær |

---

## Datakilder

| Data | Kilde | Format | URL |
|------|-------|--------|-----|
| NL 2026–27 | openfootball/internationals | `.txt` (Football.TXT) | `uefa_nations_league/2026_*.txt` |
| EM-kvalik | openfootball/internationals | `.txt` | `uefa_euro_qualification/2027_*.txt` |
| EM 2028 kampoppsett | openfootball/euro | `.txt` | `2028--united_kingdom-ireland/euro.txt` |
| EM 2028 live | openfootball (JSON) | `.json` | TBD — som `worldcup.json` for VM 2026 |

**Status:** Ingen av 2026–27-filene eksisterer ennå i openfootball. Manuell oppdatering inntil de dukker opp. Formatet er dokumentert i `agents.md`.

---

## Prioritert arbeidsliste

### Neste steg (før NL-start sept 2026)

| Oppgave | Beskrivelse | Kompleksitet |
|---------|-------------|-------------|
| **NL: alle kamper** | Hente inn kampoppsett for alle 4 League A-grupper (24 kamper til, 48 totalt) | Lav |
| **NL: kampfilter** | Filtrer kamper per gruppe, per lag, eller vis kun Norges kamper | Medium |
| **NL: kamp-tabell-funksjonalitet** | Kopiere tabellvisning fra EM (dato-gruppering, flagg, score, tidssone-støtte) | Medium |
| **NL: kvartfinale-visning** | Placeholder for QF-oppsettet (fylles etter gruppespill) | Lav |

### Etter NL-start (sept–nov 2026)

| Oppgave | Beskrivelse |
|---------|-------------|
| **Resultatoppdatering** | Script/rutine for å patche resultater inn i nations-league.json |
| **Standings auto-beregning** | Beregne poeng/mål fra kampresultater i stedet for manuell standings |
| **NL live-badge** | Vise LIVE-badge for kamper som pågår |

### Etter kvalik-trekning (des 2026)

| Oppgave | Beskrivelse |
|---------|-------------|
| **Kvalik: grupper** | Populere qualifying.json med 12 grupper og lag |
| **Kvalik: kampoppsett** | Legge inn alle kamper med datoer og arenaer |
| **Kvalik: standings-tabell** | Vise poeng/mål per gruppe med direktekvalifisering-markering |
| **Kvalik: filter** | Filtrer per gruppe, vis Norges kamper |

### Etter EM-trekning (des 2027)

| Oppgave | Beskrivelse |
|---------|-------------|
| **EM: lag inn** | Erstatte posisjonskoder med faktiske lag i matches.json |
| **EM: oppdatere teams.json** | Sette gruppeoppgaver for alle 24 lag |
| **EM: flippe tab-prioritet** | Flytte EM-faner til primær, NL/kvalik under «Mer» |
| **EM: bracket-rewrite** | Forenkle bracket fra VM (R32→Final) til EM (R16→Final) |
| **EM: tidslinje-vindu** | Beregne TL_START/TL_END dynamisk fra faktiske kamptider |

### Under EM (jun–jul 2028)

| Oppgave | Beskrivelse |
|---------|-------------|
| **Live-resultater** | Koble til openfootball JSON-feed (som worldcup.json) |
| **Statistikk-fane** | Aktivere toppscorere, mål-stats osv. |
| **TV-visninger** | Legge inn NRK/TV2-info per kamp |

---

## Teknisk gjeld

| Oppgave | Prioritet | Notat |
|---------|-----------|-------|
| **app.js modularisering** | Medium | ~5200 linjer. Dele opp i: `nl.js`, `qualifying.js`, `timeline.js`, `table.js`, `bracket.js`, `modals.js`, `filter.js`, `ui.js` |
| **Bracket-rewrite** | Medium | Nåværende kode er fra VM med R32. EM har bare R16→Final. |
| **Fjerning av VM-rester** | Lav | Noen R32/3P-referanser i app.js er ubrukte men harmløse |
| **OG-bilde** | Lav | Oppdatere og-image.png med EM-design |
| **Responsiv tab-bar** | Lav | Mange faner nå — sikre god overflow-oppførsel på mobil |

---

## Arkitektur-notater

**Tab-struktur:**
```
Synlige:  Nations League | NL-kamper | Kvalik | Kvalik-kamper
Under EM 2028 ▾:  Tidslinje | Tabell | Grupper | Sluttspill | Arenaer
```

Etter EM-trekning (des 2027) flippes dette:
```
Synlige:  Tidslinje | Tabell | Grupper | Sluttspill | Arenaer
Under Mer ▾:  Nations League | Kvalik
```

**Data-flyt:**
```
src/data/*.json  →  build.js  →  dist/data.js  →  app.js (runtime)
```

Alle turneringsdata (NL, kvalik, EM) er i separate JSON-filer og eksporteres som globale konstanter (`NATIONS_LEAGUE`, `QUALIFYING`, `MATCHES_RAW`, `TEAMS`, `STADIUMS`).
