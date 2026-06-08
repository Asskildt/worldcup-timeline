#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// FIFA VM 2026 — Build-skript
//
// Leser JSON-data fra src/data/, genererer data.js og index.html i dist/.
// Kopierer app.js og style.css til dist/.
//
// Kjør:  node build.js             # produksjon → dist/
//        node build.js --test      # testmodus (mid group stage) → dist-test/
//        node build.js --test=r32  # testmodus (etter R32, Norge videre) → dist-test/
//        node build.js --test=sf   # testmodus (SF, Norge ute i R16) → dist-test/
// Watch: npm run watch
// ─────────────────────────────────────────────────────────────────────────────

const fs   = require('fs');
const path = require('path');

// Detect --test or --test=<scenario>
const testArg = process.argv.find(a => a === '--test' || a.startsWith('--test='));
const IS_TEST  = !!testArg;
const TEST_SCENARIO = testArg
    ? (testArg.includes('=') ? testArg.split('=')[1] : 'default')
    : null;

// Detect --lang=en (bygg engelsk versjon i dist/en/)
const LANG_BUILD = process.argv.find(a => a.startsWith('--lang='))?.split('=')[1] || null;

// Map scenario name → config file
const TEST_CONFIG_MAP = {
    'default': 'test-config.json',
    'r32':     'test-r32.json',
    'sf':      'test-sf.json',
};
const TEST_CONFIG_FILE = TEST_SCENARIO ? (TEST_CONFIG_MAP[TEST_SCENARIO] || 'test-config.json') : null;

const SRC      = path.join(__dirname, 'src');
const DIST_BASE = IS_TEST ? 'dist-test' : 'dist';
const DIST     = LANG_BUILD
    ? path.join(__dirname, DIST_BASE, LANG_BUILD)
    : path.join(__dirname, DIST_BASE);
const DATA_DIR = path.join(SRC, 'data');

// ── Hjelpefunksjoner ──────────────────────────────────────────────────────────

function read(filePath) {
    return fs.readFileSync(filePath, 'utf8');
}

function write(filePath, content) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`  ✓ ${path.relative(__dirname, filePath)}`);
}

function copy(src, dest) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    console.log(`  ✓ ${path.relative(__dirname, dest)}`);
}

function readJSON(filename) {
    return JSON.parse(read(path.join(DATA_DIR, filename)));
}

// ── Tidskonvertering ──────────────────────────────────────────────────────────
// Konverterer UTC-offset-streng til desimaltimer CEST (UTC+2)
// "20:00 UTC-6" → 28 (neste dag 04:00 CEST)
// "12:00 UTC-4" → 18

function utcToCEST(timeStr) {
    const m = timeStr.match(/(\d+):(\d+)\s+UTC([+-]\d+)/);
    if (!m) return null;
    const h   = parseInt(m[1]);
    const min = parseInt(m[2]);
    const off = parseInt(m[3]);
    // CEST = UTC+2, så legg til (2 - offset) timer
    const cestH = h + (2 - off) + min / 60;
    return cestH; // kan være >= 24 (neste dag)
}

// ── Venue-kode fra stedsnavn ──────────────────────────────────────────────────

const VENUE_MAP = {
    'Los Angeles (Inglewood)':                  'LA',
    'Dallas (Arlington)':                       'DA',
    'Atlanta':                                  'AT',
    'San Francisco Bay Area (Santa Clara)':     'SF',
    'Guadalajara (Zapopan)':                    'GD',
    'Boston (Foxborough)':                      'BO',
    'Seattle':                                  'SE',
    'Kansas City':                              'KA',
    'Miami (Miami Gardens)':                    'MI',
    'Vancouver':                                'VA',
    'Mexico City':                              'MX',
    'Monterrey (Guadalupe)':                    'MO',
    'New York/New Jersey (East Rutherford)':    'NY',
    'Philadelphia':                             'PH',
    'Houston':                                  'HO',
    'Toronto':                                  'TO',
};

function venueCode(ground) {
    return VENUE_MAP[ground] || ground.slice(0, 2).toUpperCase();
}

// ── Runde → type + grp ───────────────────────────────────────────────────────

function roundToType(round) {
    if (round.startsWith('Matchday') || round.startsWith('Group'))  return 'g';
    if (round === 'Round of 32')    return 'r32';
    if (round === 'Round of 16')    return 'r16';
    if (round === 'Quarter-final')  return 'qf';
    if (round === 'Semi-final')     return 'sf';
    if (round === 'Match for third place') return 'fin';
    if (round === 'Final')          return 'fin';
    return 'g';
}

function roundToGrp(round, group) {
    if (round === 'Round of 32')    return 'R32';
    if (round === 'Round of 16')    return 'R16';
    if (round === 'Quarter-final')  return 'QF';
    if (round === 'Semi-final')     return 'SF';
    if (round === 'Match for third place') return '3P';
    if (round === 'Final')          return 'FIN';
    // Gruppespill: "Group A" → "A"
    if (group) return group.replace('Group ', '');
    return '?';
}

// ── Generer flag-sprite fra flag-svgs/ ───────────────────────────────────────
// Flagg-SVGer er hentet fra https://flagicons.lipis.dev/ (MIT-lisens, 4x3-format)
// For å legge til nye flagg: last ned {cc}.svg fra flagicons.lipis.dev og legg i src/flag-svgs/

function buildFlagSprite() {
    const flagDir = path.join(SRC, 'flag-svgs');
    const teamsData = JSON.parse(read(path.join(DATA_DIR, 'teams.json')));

    // Samle alle unike ISO-koder fra teams (trekk ut cc = alt før første _)
    const codes = new Set();
    teamsData.forEach(t => {
        if (t.flag_id) codes.add(t.flag_id.split('_')[0]);
    });
    // Legg til vertlands-koder fra stadions (us, ca, mx) for modal/kart
    ['us', 'ca', 'mx'].forEach(c => codes.add(c));

    const symbols = [];
    for (const cc of [...codes].sort()) {
        const filePath = path.join(flagDir, `${cc}.svg`);
        if (!fs.existsSync(filePath)) {
            console.warn(`  ⚠ Flagg mangler: ${cc}.svg`);
            continue;
        }
        let svg = read(filePath);
        // Fjern xml-deklarasjon og ytterste <svg>-tag, behold innhold
        // Sett viewBox og id fra original <svg>
        const viewBoxMatch = svg.match(/viewBox="([^"]+)"/);
        const viewBox = viewBoxMatch ? viewBoxMatch[1] : '0 0 640 480';
        // Fjern outer svg-tags og behold innhold
        const inner = svg
            .replace(/<\?xml[^>]*\?>/g, '')
            .replace(/<svg[^>]*>/, '')
            .replace(/<\/svg>/, '')
            .trim();
        symbols.push(`<symbol id="${cc}" viewBox="${viewBox}">${inner}</symbol>`);
    }

    const sprite = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">\n${symbols.join('\n')}\n</svg>`;
    const outPath = path.join(SRC, 'flags.svg');
    fs.writeFileSync(outPath, sprite, 'utf8');
    console.log(`  ✓ src/flags.svg (${symbols.length} flagg fra flag-icons)`);
    return sprite;
}

// ── Generer data.js ───────────────────────────────────────────────────────────

function buildDataJS() {
    // I testmodus: bruk scenario-spesifikk matches-fil hvis den finnes
    const matchesFile = IS_TEST && TEST_SCENARIO !== 'default'
        ? `matches-test-${TEST_SCENARIO}.json`
        : IS_TEST ? 'matches-test-group.json'
        : 'matches.json';
    const matchesData  = readJSON(matchesFile);
    const teamsData    = readJSON('teams.json');
    const stadiumsData = readJSON('stadiums.json');

    // ── TEAMS-objekt ──────────────────────────────────────────────────────────
    const teams = {};
    teamsData.forEach(t => {
        const entry = {
            flag:    t.flag_icon,
            flag_id: t.flag_id ? t.flag_id.split('_')[0] : null,
            code:    t.fifa_code,
            group:   t.group,
            confed:  t.confed,
            ...(t.name_no ? { name_no: t.name_no } : {}),
        };
        teams[t.name] = entry;
        // Alias for normalisert navn — merkes slik at buildGroups kan filtrere dem ut
        if (t.name_normalised) {
            teams[t.name_normalised] = { ...entry, _alias: t.name };
        }
    });

    // ── STADIUMS-objekt ───────────────────────────────────────────────────────
    const stadiums = {};
    stadiumsData.stadiums.forEach(s => {
        // Bruk code-feltet fra JSON direkte, fallback til VENUE_MAP
        const code = s.code || venueCode(s.city);
        stadiums[code] = {
            city:    s.city,
            country: s.country || null,
            region:  s.region  || null,
            name:    s.name,
            cap:     s.capacity,
            tz:      s.timezone || null,
            cc:      s.cc || null,
        };
    });

    // ── MATCHES_RAW-array ─────────────────────────────────────────────────────
    // I testmodus: bygg TV-oppslag fra matches.json slik at TV-data alltid er tilgjengelig
    const tvLookup = {};
    if (IS_TEST) {
        const prodMatches = readJSON('matches.json');
        prodMatches.matches.forEach(m => {
            if (m.tv) {
                const key = `${m.date}|${m.team1}|${m.team2}`;
                tvLookup[key] = m.tv;
            }
        });
    }

    const matchesRaw = matchesData.matches.map(m => {
        const t    = utcToCEST(m.time);
        const type = roundToType(m.round);
        const grp  = roundToGrp(m.round, m.group);
        const v    = venueCode(m.ground);
        // Slå opp TV i proddata hvis testmodus og feltet mangler
        const tv = m.tv || (IS_TEST ? tvLookup[`${m.date}|${m.team1}|${m.team2}`] : null);
        return {
            isoDate: m.date,
            round:   m.round,
            num:     m.num || null,
            type,
            grp,
            team1:   m.team1,
            team2:   m.team2,
            v,
            ground:  m.ground,
            t,
            ...(m.score ? { score: m.score } : {}),
            ...(m.goals1 ? { goals1: m.goals1 } : {}),
            ...(m.goals2 ? { goals2: m.goals2 } : {}),
            ...(tv ? { tv } : {}),
        };
    });

    // Sorter etter dato og tid
    matchesRaw.sort((a, b) => {
        if (a.isoDate !== b.isoDate) return a.isoDate < b.isoDate ? -1 : 1;
        return a.t - b.t;
    });

    // ── Skriv data.js ─────────────────────────────────────────────────────────
    // I testmodus: injiser testresultater og overstyr Date.now() med simulert tid
    let testPreamble = '';
    if (IS_TEST) {
        const testConfig = readJSON(TEST_CONFIG_FILE);
        const simulatedNow = new Date(testConfig.simulatedNow).getTime();

        testPreamble = `
// ── TESTMODUS ─────────────────────────────────────────────────────────────────
// Scenario: ${TEST_SCENARIO} (kampdata fra matches-test-${TEST_SCENARIO !== 'default' ? TEST_SCENARIO : 'config'}.json)
// Simulert tidspunkt: ${testConfig.simulatedNow}
const _REAL_DATE_NOW = Date.now.bind(Date);
Date.now = () => ${simulatedNow};
// ─────────────────────────────────────────────────────────────────────────────
`;
    }

    const out = `// ─────────────────────────────────────────────────────────────────────────────
// FIFA VM 2026 — Generert av build.js — IKKE REDIGER MANUELT
// Kilde: src/data/*.json
// Bygget: ${new Date().toISOString()}${IS_TEST ? `\n// TESTMODUS: scenario=${TEST_SCENARIO} (${TEST_CONFIG_FILE})` : ''}
// ─────────────────────────────────────────────────────────────────────────────
${testPreamble}
const TEAMS = ${JSON.stringify(teams, null, 2)};

const STADIUMS = ${JSON.stringify(stadiums, null, 2)};

// Hjelpefunksjoner
function fmtT(t) {
  const h = Math.floor(t) % 24;
  const m = Math.round((t % 1) * 60);
  return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
}
function fmtDate(iso) {
  const mo = ['jan','feb','mar','apr','mai','jun','jul','aug','sep','okt','nov','des'];
  const [, , mm, dd] = iso.match(/(\\d+)-(\\d+)-(\\d+)/) || [];
  return dd ? \`\${parseInt(dd)}. \${mo[parseInt(mm)-1]}\` : iso;
}
function fmtDay(iso) {
  return ['Søn','Man','Tir','Ons','Tor','Fre','Lør'][new Date(iso + 'T12:00:00').getDay()];
}
function groupByDay(matches) {
  const days = [];
  let cur = null;
  matches.forEach(m => {
    if (!cur || cur.isoDate !== m.isoDate) {
      cur = { date:m.date, isoDate:m.isoDate, day:m.day, type:m.type, matches:[] };
      days.push(cur);
    }
    cur.matches.push(m);
  });
  return days;
}

const MATCHES_RAW = ${JSON.stringify(matchesRaw, null, 2)};

// Bygg MATCHES med flagg, stadioninfo og dato-formatering
function buildMatches(raw, scoreMap) {
  const sorted = [...raw].sort((a, b) => {
    if (a.isoDate !== b.isoDate) return a.isoDate < b.isoDate ? -1 : 1;
    return a.t - b.t;
  });
  // Scores: bruk m.score fra rådata (testmodus), deretter scoreMap (live API), deretter TEST_SCORES (legacy)
  const effectiveScoreMap = (typeof TEST_SCORES !== 'undefined') ? TEST_SCORES : (scoreMap || {});
  return sorted.map(m => {
    const t1 = TEAMS[m.team1] || {};
    const t2 = TEAMS[m.team2] || {};
    const st = STADIUMS[m.v] || {};
    const key = \`\${m.isoDate}|\${m.team1}|\${m.team2}\`;
    // Score-prioritering: 1) direkte i rådata (matches-test-*.json), 2) scoreMap fra API
    const scoreData = m.score || effectiveScoreMap[key] || null;
    return {
      ...m,
      date:    fmtDate(m.isoDate),
      day:     fmtDay(m.isoDate),
      flag1:   t1.flag_id ? \`<svg class="flag-svg" aria-hidden="true"><use href="#\${t1.flag_id}"/></svg>\` : (t1.flag || ''),
      flag2:   t2.flag_id ? \`<svg class="flag-svg" aria-hidden="true"><use href="#\${t2.flag_id}"/></svg>\` : (t2.flag || ''),
      stadium: st.name || m.ground,
      cap:     st.cap || null,
      score:   scoreData,
    };
  });
}
`;

    write(path.join(DIST, 'data.js'), out);
    return { matchesRaw, teamsData, stadiumsData };
}

// ── Generer kamp-sider for deling (OG-tags per kamp) ─────────────────────────
function buildSharePages(matchesRaw, teamsData, stadiumsData) {
    const shareDir = path.join(DIST, 'kamp');
    fs.mkdirSync(shareDir, { recursive: true });

    const roundLabels = {
        'Round of 32': '16-delsfinale', 'Round of 16': 'Åttedelsfinale',
        'Quarter-final': 'Kvartfinale', 'Semi-final': 'Semifinale',
        'Match for third place': 'Bronsefinale', 'Final': 'Finale'
    };

    matchesRaw.forEach(m => {
        const slug = m.num
            ? String(m.num)
            : `${m.isoDate}-${m.team1.replace(/[^a-zA-Z0-9]/g,'-')}-${m.team2.replace(/[^a-zA-Z0-9]/g,'-')}`;
        const hash = m.num
            ? `#kamp-${m.num}`
            : `#${m.isoDate}-${m.team1.replace(/\s/g,'-')}-${m.team2.replace(/\s/g,'-')}`;

        const t1 = teamsData.find(t => t.name === m.team1) || {};
        const t2 = teamsData.find(t => t.name === m.team2) || {};
        const flag1 = t1.flag_icon || '';
        const flag2 = t2.flag_icon || '';
        const st = stadiumsData.stadiums.find(s => s.code === venueCode(m.ground)) || {};

        const cestH = Math.floor(m.t) % 24;
        const cestMin = Math.round((m.t % 1) * 60);
        const timeStr = `${String(cestH).padStart(2,'0')}:${String(cestMin).padStart(2,'0')}`;

        // Norsk dato og ukedag, med "natt til"-logikk for kamper etter midnatt
        const DAYS_NO = ['søndag','mandag','tirsdag','onsdag','torsdag','fredag','lørdag'];
        const DAYS_NO_CAP = ['Søndag','Mandag','Tirsdag','Onsdag','Torsdag','Fredag','Lørdag'];
        const MONTHS_NO = ['jan','feb','mar','apr','mai','jun','jul','aug','sep','okt','nov','des'];
        const matchDate = new Date(m.isoDate + 'T12:00:00');
        const isNextDay = m.t >= 24; // kamp etter midnatt CEST
        const gameDate = new Date(matchDate);
        if (isNextDay) gameDate.setDate(gameDate.getDate() + 1);
        const dayName = DAYS_NO[gameDate.getDay()];
        const dayNameCap = DAYS_NO_CAP[gameDate.getDay()];
        const dateLabel = `${gameDate.getDate()}. ${MONTHS_NO[gameDate.getMonth()]}`;

        // "Natt til onsdag kl. 02:00" vs "Tirsdag kl. 21:00"
        const isMidnight = cestH >= 0 && cestH < 6 && isNextDay;
        const prevDayName = DAYS_NO[matchDate.getDay()];
        const timeLabel = isMidnight
            ? `natt til ${dayName} kl. ${timeStr}`
            : `${dayName} kl. ${timeStr}`;
        const timeLabelCap = isMidnight
            ? `Natt til ${dayName} kl. ${timeStr}`
            : `${dayNameCap} kl. ${timeStr}`;

        const roundLabel = roundLabels[m.round] || m.round;
        const hasTeams = !m.team1.match(/^\d|^[A-Z]\d|^W|^L/);
        const matchDesc = hasTeams
            ? `${flag1} ${m.team1} v ${m.team2} ${flag2}`
            : `${roundLabel}${m.num ? ' #'+m.num : ''}`;

        const title = `${matchDesc} — ${timeLabelCap} ${dateLabel} · FIFA VM 2026`;
        const desc = hasTeams
            ? `${m.team1} mot ${m.team2} · ${timeLabelCap} ${dateLabel} · ${st.name || m.ground}${st.city ? ', '+st.city : ''} · FIFA VM 2026`
            : `${roundLabel} · ${timeLabelCap} ${dateLabel} · ${st.name || m.ground}${st.city ? ', '+st.city : ''} · FIFA VM 2026`;

        const html = `<!DOCTYPE html>
<html lang="no">
<head>
<meta charset="UTF-8">
<meta name="robots" content="noindex, follow">
<title>${title}</title>
<meta name="description" content="${desc}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="https://fotballvm.asskildt.eu/kamp/${slug}.html">
<meta property="og:type" content="website">
<meta property="og:site_name" content="fotballvm.asskildt.eu">
<meta property="og:image" content="https://fotballvm.asskildt.eu/og-image.png">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${desc}">
<link rel="canonical" href="https://fotballvm.asskildt.eu/${hash}">
<meta http-equiv="refresh" content="0;url=https://fotballvm.asskildt.eu/${hash}">
</head>
<body>
<script>location.replace('https://fotballvm.asskildt.eu/${hash}');</script>
</body>
</html>`;
        write(path.join(shareDir, `${slug}.html`), html);
    });
    console.log(`  ✓ ${matchesRaw.length} kamp-sider generert`);

    // Generer sitemap.xml
    const today = new Date().toISOString().slice(0, 10);
    const sitemapBase = IS_TEST ? '' : 'https://fotballvm.asskildt.eu';
    write(path.join(DIST, 'sitemap.xml'),
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${sitemapBase || 'https://fotballvm.asskildt.eu'}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://fotballvm.asskildt.eu/en/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>0.9</priority>
  </url>
</urlset>
`);
    console.log(`  ✓ sitemap.xml`);
}


function buildHTML(matchesRaw, stadiumsData) {
    const template   = read(path.join(SRC, 'templates', 'index.html'));
    // Velg head-fil basert på --lang=XX flagg
    const headFile   = LANG_BUILD ? `head-${LANG_BUILD}.html` : 'head.html';
    const head       = read(path.join(SRC, 'partials', headFile));
    const themeInit  = read(path.join(SRC, 'partials', 'theme-init.html'));
    const footer     = read(path.join(SRC, 'partials', 'footer.html'));

    // ── JSON-LD: SportsEvent for turneringen ──────────────────────────────────
    const stadiumMap = {};
    stadiumsData.stadiums.forEach(s => { stadiumMap[s.code || venueCode(s.city)] = s; });

    // Finn første og siste kamp for start/sluttdato
    const sorted = [...matchesRaw].sort((a, b) => a.isoDate < b.isoDate ? -1 : 1);
    const firstMatch = sorted[0];
    const lastMatch  = sorted[sorted.length - 1];

    // UTC ISO-tidspunkt fra kamp (CEST = UTC+2)
    function matchStartUTC(m) {
        const h   = Math.floor(m.t) % 24;
        const min = Math.round((m.t % 1) * 60);
        const d   = new Date(m.isoDate + 'T00:00:00Z');
        if (m.t >= 24) d.setUTCDate(d.getUTCDate() + 1);
        d.setUTCHours(h - 2, min, 0, 0);
        return d.toISOString();
    }

    const isEn = LANG_BUILD === 'en';
    const siteUrl = isEn
        ? 'https://fotballvm.asskildt.eu/en/'
        : 'https://fotballvm.asskildt.eu/';

    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'SportsEvent',
        'name': isEn ? 'FIFA World Cup 2026' : 'FIFA VM 2026',
        'alternateName': isEn ? 'FIFA VM 2026' : 'FIFA World Cup 2026',
        'description': isEn
            ? 'All 104 matches of the 2026 FIFA World Cup. Timeline, match list, group standings and knockout bracket. Timezone auto-detected, 9 timezone options.'
            : 'Alle 104 kamper i fotball-VM 2026. Tidslinje, kamptabell, gruppestandinger og sluttspill. Tidssone tilpasses automatisk.',
        'url': siteUrl,
        'startDate': matchStartUTC(firstMatch),
        'endDate': matchStartUTC(lastMatch),
        'location': {
            '@type': 'Place',
            'name': isEn ? 'USA, Canada and Mexico' : 'USA, Canada og Mexico',
            'address': { '@type': 'PostalAddress', 'addressCountry': 'US' }
        },
        'sport': 'Football',
        'organizer': {
            '@type': 'Organization',
            'name': 'FIFA',
            'url': 'https://www.fifa.com'
        },
        'image': 'https://fotballvm.asskildt.eu/og-image.png',
        'inLanguage': isEn ? 'en' : 'nb',
        'isAccessibleForFree': true,
        'audience': { '@type': 'Audience', 'audienceType': isEn ? 'Football fans' : 'Fotballfans' }
    };

    const jsonLdScript = `<script type="application/ld+json">\n    ${JSON.stringify(jsonLd, null, 2).replace(/\n/g, '\n    ')}\n    </script>`;

    // Inline flags.svg as a hidden sprite immediately after <body>
    const flagsSvgPath = path.join(SRC, 'flags.svg');
    let flagSprite = '';
    if (fs.existsSync(flagsSvgPath)) {
        const flagsSvgContent = read(flagsSvgPath);
        flagSprite = `\n<div style="display:none" id="flag-sprite">\n${flagsSvgContent}\n</div>`;
    }

    // Inline map.svg for lokal tilgang (unngår CORS ved file://)
    const { buildMapSVG } = require('./build-map.js');
    buildMapSVG();
    const mapSvgPath = path.join(SRC, 'map.svg');
    let mapInline = '';
    if (fs.existsSync(mapSvgPath)) {
        mapInline = `\n<div style="display:none" id="map-svg-source">\n${read(mapSvgPath)}\n</div>`;
    }

    let html = template
        .replace('{{head}}',       head.trimEnd())
        .replace('{{lang}}',       LANG_BUILD || 'no')
        .replace('{{theme-init}}', themeInit.trimEnd())
        .replace('{{footer}}',     footer.trimEnd())
        .replace('{{json-ld}}',    jsonLdScript);

    // Inject sprite right after <body>
    if (flagSprite) {
        html = html.replace('<body>', '<body>' + flagSprite);
    }
    if (mapInline) {
        html = html.replace('<body>', '<body>' + mapInline);
    }

    write(path.join(DIST, 'index.html'), html);
}

// ── Kopier statiske filer ─────────────────────────────────────────────────────

function copyStatic() {
    if (LANG_BUILD) {
        // Engelske build: kun app.js og data.js — alt annet refereres via ../
        // data.js kopieres fra base dist (må bygges først uten --lang)
        copy(path.join(SRC, 'js', 'app.js'), path.join(DIST, 'app.js'));
        const baseDataJs = path.join(__dirname, DIST_BASE, 'data.js');
        if (fs.existsSync(baseDataJs)) {
            copy(baseDataJs, path.join(DIST, 'data.js'));
        }
        return;
    }
    copy(path.join(SRC, 'js', 'app.js'),  path.join(DIST, 'app.js'));
    copy(path.join(SRC, 'style.css'),     path.join(DIST, 'style.css'));
    copy(path.join(SRC, 'crt.css'),       path.join(DIST, 'crt.css'));
    // Kopier favicon hvis den finnes
    const faviconSvg = path.join(SRC, 'favicon.svg');
    if (fs.existsSync(faviconSvg)) {
        copy(faviconSvg, path.join(DIST, 'favicon.svg'));
    }
    // Kopier transpose-ikon
    const transposeSvg = path.join(SRC, 'transpose.svg');
    if (fs.existsSync(transposeSvg)) {
        copy(transposeSvg, path.join(DIST, 'transpose.svg'));
    }
    // Kopier flags.svg hvis den finnes
    const flagsSvg = path.join(SRC, 'flags.svg');
    if (fs.existsSync(flagsSvg)) {
        copy(flagsSvg, path.join(DIST, 'flags.svg'));
    }
    // Kopier NFF crest hvis den finnes
    const nffCrest = path.join(SRC, 'NFF_Crest_01_Gradient_CMYK.png');
    if (fs.existsSync(nffCrest)) {
        copy(nffCrest, path.join(DIST, 'nff-crest.png'));
    }
    // og og-image.png hvis den finnes
    const ogImage = path.join(SRC, 'og-image.png');
    if (fs.existsSync(ogImage)) {
        copy(ogImage, path.join(DIST, 'og-image.png'));
    }

    // Generer robots.txt
    write(path.join(DIST, 'robots.txt'),
`User-agent: *
Allow: /
Sitemap: https://fotballvm.asskildt.eu/sitemap.xml
`);

    // Kopier generert arena-kart
    const mapSvg = path.join(SRC, 'map.svg');
    if (fs.existsSync(mapSvg)) {
        copy(mapSvg, path.join(DIST, 'map.svg'));
    }
}

// ── Kjør build ────────────────────────────────────────────────────────────────

console.log(`\nBuilding fotball-vm${IS_TEST ? ` [TESTMODUS: ${TEST_SCENARIO}]` : ''}${LANG_BUILD ? ` [LANG: ${LANG_BUILD}]` : ''}...`);
try {
    if (!LANG_BUILD) buildFlagSprite(); // flagg-sprite bygges kun for base
    const { matchesRaw, teamsData, stadiumsData } = buildDataJS();
    buildHTML(matchesRaw, stadiumsData);
    copyStatic();
    if (!LANG_BUILD) buildSharePages(matchesRaw, teamsData, stadiumsData); // kamp-sider kun for base
    console.log('\nDone.\n');
} catch (err) {
    console.error('\nBuild failed:', err.message);
    process.exit(1);
}
