#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// UEFA EM 2028 — Build-skript
//
// Leser JSON-data fra src/data/, genererer data.js og index.html i dist/.
// Kopierer app.js og style.css til dist/.
//
// Kjør:  node build.js             # produksjon → dist/
// Watch: npm run watch
// ─────────────────────────────────────────────────────────────────────────────

const fs   = require('fs');
const path = require('path');

// Detect --lang=en (bygg engelsk versjon i dist/en/)
const LANG_BUILD = process.argv.find(a => a.startsWith('--lang='))?.split('=')[1] || null;

const SRC      = path.join(__dirname, 'src');
const DIST_BASE = 'dist';
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
// Konverterer tid til desimaltimer CEST (UTC+2)
// "21:00 CEST" → 21
// "18:00 CEST" → 18
// "15:00 CEST" → 15

function timeToCEST(timeStr) {
    if (!timeStr) return null;
    // Direkte CEST-format
    let m = timeStr.match(/(\d+):(\d+)\s+CEST/);
    if (m) {
        return parseInt(m[1]) + parseInt(m[2]) / 60;
    }
    // UTC-offset format
    m = timeStr.match(/(\d+):(\d+)\s+UTC([+-]\d+)/);
    if (m) {
        const h   = parseInt(m[1]);
        const min = parseInt(m[2]);
        const off = parseInt(m[3]);
        return h + (2 - off) + min / 60;
    }
    // Bare klokkeslett (antar CEST)
    m = timeStr.match(/(\d+):(\d+)/);
    if (m) {
        return parseInt(m[1]) + parseInt(m[2]) / 60;
    }
    return null;
}

// ── Venue-kode fra stedsnavn ──────────────────────────────────────────────────

const VENUE_MAP = {
    'London (Wembley Stadium)':             'WE',
    'Cardiff (Principality Stadium)':       'PS',
    'London (Tottenham Hotspur Stadium)':   'TH',
    'Manchester (City of Manchester Stadium)': 'MC',
    'Liverpool (Everton Stadium)':          'EV',
    'Newcastle (St James\' Park)':          'SJ',
    'Glasgow (Hampden Park)':               'HP',
    'Dublin (Dublin Arena)':                'DA',
    'Birmingham (Villa Park)':              'VP',
};

function venueCode(ground) {
    return VENUE_MAP[ground] || ground.slice(0, 2).toUpperCase();
}

// ── Runde → type + grp ───────────────────────────────────────────────────────

function roundToType(round) {
    if (round.startsWith('Matchday') || round.startsWith('Group'))  return 'g';
    if (round === 'Round of 16')    return 'r16';
    if (round === 'Quarter-final' || round === 'Quarter-finals')  return 'qf';
    if (round === 'Semi-final' || round === 'Semi-finals')     return 'sf';
    if (round === 'Final')          return 'fin';
    return 'g';
}

function roundToGrp(round, group) {
    if (round === 'Round of 16')    return 'R16';
    if (round === 'Quarter-final' || round === 'Quarter-finals')  return 'QF';
    if (round === 'Semi-final' || round === 'Semi-finals')     return 'SF';
    if (round === 'Final')          return 'FIN';
    if (group) return group.replace('Group ', '');
    return '?';
}

// ── Generer flag-sprite fra flag-svgs/ ───────────────────────────────────────

function buildFlagSprite() {
    const flagDir = path.join(SRC, 'flag-svgs');
    const teamsData = JSON.parse(read(path.join(DATA_DIR, 'teams.json')));

    const codes = new Set();
    teamsData.forEach(t => {
        if (t.flag_id) codes.add(t.flag_id.split('_')[0]);
    });
    // Vertlands-koder (England, Scotland, Wales, Ireland)
    ['gb-eng', 'gb-sct', 'gb-wls', 'ie'].forEach(c => codes.add(c));

    const symbols = [];
    for (const cc of [...codes].sort()) {
        const filePath = path.join(flagDir, `${cc}.svg`);
        if (!fs.existsSync(filePath)) {
            console.warn(`  ⚠ Flagg mangler: ${cc}.svg`);
            continue;
        }
        let svg = read(filePath);
        const viewBoxMatch = svg.match(/viewBox="([^"]+)"/);
        const viewBox = viewBoxMatch ? viewBoxMatch[1] : '0 0 640 480';
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
    const matchesData  = readJSON('matches.json');
    const teamsData    = readJSON('teams.json');
    const stadiumsData = readJSON('stadiums.json');
    const qualifyingData = readJSON('qualifying.json');
    const nlData       = readJSON('nations-league.json');

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
        if (t.name_normalised) {
            teams[t.name_normalised] = { ...entry, _alias: t.name };
        }
    });

    // ── STADIUMS-objekt ───────────────────────────────────────────────────────
    const stadiums = {};
    stadiumsData.stadiums.forEach(s => {
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
    const matchesRaw = matchesData.matches.map(m => {
        const t    = timeToCEST(m.time);
        const type = roundToType(m.round);
        const grp  = roundToGrp(m.round, m.group);
        const v    = venueCode(m.ground);
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
            ...(m.tv ? { tv: m.tv } : {}),
        };
    });

    // Sorter etter dato og tid
    matchesRaw.sort((a, b) => {
        if (a.isoDate !== b.isoDate) return a.isoDate < b.isoDate ? -1 : 1;
        return a.t - b.t;
    });

    const out = `// ─────────────────────────────────────────────────────────────────────────────
// UEFA EM 2028 — Generert av build.js — IKKE REDIGER MANUELT
// Kilde: src/data/*.json
// Bygget: ${new Date().toISOString()}
// ─────────────────────────────────────────────────────────────────────────────
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
  const effectiveScoreMap = scoreMap || {};
  return sorted.map(m => {
    const t1 = TEAMS[m.team1] || {};
    const t2 = TEAMS[m.team2] || {};
    const st = STADIUMS[m.v] || {};
    const key = \`\${m.isoDate}|\${m.team1}|\${m.team2}\`;
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

const QUALIFYING = ${JSON.stringify(qualifyingData, null, 2)};

const NATIONS_LEAGUE = ${JSON.stringify(nlData, null, 2)};
`;

    write(path.join(DIST, 'data.js'), out);
    return { matchesRaw, teamsData, stadiumsData };
}

// ── Generer kamp-sider for deling (OG-tags per kamp) ─────────────────────────
function buildSharePages(matchesRaw, teamsData, stadiumsData) {
    const shareDir = path.join(DIST, 'kamp');
    fs.mkdirSync(shareDir, { recursive: true });

    const roundLabels = {
        'Round of 16': 'Åttedelsfinale',
        'Quarter-final': 'Kvartfinale',
        'Quarter-finals': 'Kvartfinale',
        'Semi-final': 'Semifinale',
        'Semi-finals': 'Semifinale',
        'Final': 'Finale'
    };

    matchesRaw.forEach((m, idx) => {
        const slug = `${m.isoDate}-${m.team1.replace(/[^a-zA-Z0-9]/g,'-')}-${m.team2.replace(/[^a-zA-Z0-9]/g,'-')}`;
        const hash = `#${m.isoDate}-${m.team1.replace(/\s/g,'-')}-${m.team2.replace(/\s/g,'-')}`;

        const t1 = teamsData.find(t => t.name === m.team1) || {};
        const t2 = teamsData.find(t => t.name === m.team2) || {};
        const flag1 = t1.flag_icon || '';
        const flag2 = t2.flag_icon || '';
        const st = stadiumsData.stadiums.find(s => s.code === venueCode(m.ground)) || {};

        const cestH = Math.floor(m.t) % 24;
        const cestMin = Math.round((m.t % 1) * 60);
        const timeStr = `${String(cestH).padStart(2,'0')}:${String(cestMin).padStart(2,'0')}`;

        const DAYS_NO = ['søndag','mandag','tirsdag','onsdag','torsdag','fredag','lørdag'];
        const DAYS_NO_CAP = ['Søndag','Mandag','Tirsdag','Onsdag','Torsdag','Fredag','Lørdag'];
        const MONTHS_NO = ['jan','feb','mar','apr','mai','jun','jul','aug','sep','okt','nov','des'];
        const matchDate = new Date(m.isoDate + 'T12:00:00');
        const dayName = DAYS_NO[matchDate.getDay()];
        const dayNameCap = DAYS_NO_CAP[matchDate.getDay()];
        const dateLabel = `${matchDate.getDate()}. ${MONTHS_NO[matchDate.getMonth()]}`;
        const timeLabelCap = `${dayNameCap} kl. ${timeStr}`;

        const roundLabel = roundLabels[m.round] || m.round;
        const hasTeams = !m.team1.match(/^\d|^[A-Z]\d|^W|^L/);
        const matchDesc = hasTeams
            ? `${flag1} ${m.team1} v ${m.team2} ${flag2}`
            : `${roundLabel}`;

        const title = `${matchDesc} — ${timeLabelCap} ${dateLabel} · UEFA EM 2028`;
        const desc = hasTeams
            ? `${m.team1} mot ${m.team2} · ${timeLabelCap} ${dateLabel} · ${st.name || m.ground}${st.city ? ', '+st.city : ''} · UEFA EM 2028`
            : `${roundLabel} · ${timeLabelCap} ${dateLabel} · ${st.name || m.ground}${st.city ? ', '+st.city : ''} · UEFA EM 2028`;

        const html = `<!DOCTYPE html>
<html lang="no">
<head>
<meta charset="UTF-8">
<meta name="robots" content="noindex, follow">
<title>${title}</title>
<meta name="description" content="${desc}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="https://em28.asskildt.eu/kamp/${slug}.html">
<meta property="og:type" content="website">
<meta property="og:site_name" content="em28.asskildt.eu">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${desc}">
<link rel="canonical" href="https://em28.asskildt.eu/${hash}">
<meta http-equiv="refresh" content="0;url=https://em28.asskildt.eu/${hash}">
</head>
<body>
<script>location.replace('https://em28.asskildt.eu/${hash}');</script>
</body>
</html>`;
        write(path.join(shareDir, `${slug}.html`), html);
    });
    console.log(`  ✓ ${matchesRaw.length} kamp-sider generert`);

    // Generer sitemap.xml
    const today = new Date().toISOString().slice(0, 10);
    const sitemapBase = 'https://em28.asskildt.eu';
    write(path.join(DIST, 'sitemap.xml'),
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${sitemapBase}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${sitemapBase}/en/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>0.9</priority>
  </url>
</urlset>
`);
    console.log(`  ✓ sitemap.xml`);
}

function buildHTML(matchesRaw, stadiumsData, teamsData) {
    const template   = read(path.join(SRC, 'templates', 'index.html'));
    const headFile   = LANG_BUILD ? `head-${LANG_BUILD}.html` : 'head.html';
    const head       = read(path.join(SRC, 'partials', headFile));
    const themeInit  = read(path.join(SRC, 'partials', 'theme-init.html'));
    const footer     = read(path.join(SRC, 'partials', 'footer.html'));

    // ── JSON-LD: SportsEvent for turneringen ──────────────────────────────────
    const stadiumMap = {};
    stadiumsData.stadiums.forEach(s => { stadiumMap[s.code || venueCode(s.city)] = s; });

    const sorted = [...matchesRaw].sort((a, b) => a.isoDate < b.isoDate ? -1 : 1);
    const firstMatch = sorted[0];
    const lastMatch  = sorted[sorted.length - 1];

    function matchStartUTC(m) {
        const h   = Math.floor(m.t) % 24;
        const min = Math.round((m.t % 1) * 60);
        const d   = new Date(m.isoDate + 'T00:00:00Z');
        if (m.t >= 24) d.setUTCDate(d.getUTCDate() + 1);
        d.setUTCHours(h - 2, min, 0, 0); // CEST = UTC+2
        return d.toISOString();
    }

    const isEn = LANG_BUILD === 'en';
    const siteUrl = isEn
        ? 'https://em28.asskildt.eu/en/'
        : 'https://em28.asskildt.eu/';

    // Performer: alle 24 deltakende landslag som SportsTeam
    const performer = teamsData.map(t => ({
        '@type': 'SportsTeam',
        'name': t.name,
        ...(t.fifa_code ? { 'alternateName': t.fifa_code } : {}),
    }));

    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'SportsEvent',
        'name': isEn ? 'UEFA Euro 2028' : 'UEFA EM 2028',
        'alternateName': isEn ? 'UEFA EM 2028' : 'UEFA Euro 2028',
        'description': isEn
            ? 'All 51 matches of UEFA Euro 2028 in the UK and Ireland. Timeline, match list, group standings and knockout bracket.'
            : 'Alle 51 kamper i fotball-EM 2028 i Storbritannia og Irland. Tidslinje, kamptabell, gruppestandinger og sluttspill.',
        'url': siteUrl,
        'startDate': matchStartUTC(firstMatch),
        'endDate': matchStartUTC(lastMatch),
        'eventStatus': 'https://schema.org/EventScheduled',
        'location': {
            '@type': 'Place',
            'name': isEn ? 'United Kingdom and Ireland' : 'Storbritannia og Irland',
            'address': { '@type': 'PostalAddress', 'addressCountry': 'GB' }
        },
        'sport': 'Football',
        'organizer': {
            '@type': 'Organization',
            'name': 'UEFA',
            'url': 'https://www.uefa.com'
        },
        'performer': performer,
        'image': 'https://em28.asskildt.eu/og-image.png',
        'inLanguage': isEn ? 'en' : 'nb',
        'isAccessibleForFree': true
    };

    const jsonLdScript = `<script type="application/ld+json">\n    ${JSON.stringify(jsonLd, null, 2).replace(/\n/g, '\n    ')}\n    </script>`;

    // Inline flags.svg as a hidden sprite immediately after <body>
    const flagsSvgPath = path.join(SRC, 'flags.svg');
    let flagSprite = '';
    if (fs.existsSync(flagsSvgPath)) {
        const flagsSvgContent = read(flagsSvgPath);
        flagSprite = `\n<div style="display:none" id="flag-sprite">\n${flagsSvgContent}\n</div>`;
    }

    // Inline map.svg for lokal tilgang
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
    const faviconSvg = path.join(SRC, 'favicon.svg');
    if (fs.existsSync(faviconSvg)) {
        copy(faviconSvg, path.join(DIST, 'favicon.svg'));
    }
    const transposeSvg = path.join(SRC, 'transpose.svg');
    if (fs.existsSync(transposeSvg)) {
        copy(transposeSvg, path.join(DIST, 'transpose.svg'));
    }
    const flagsSvg = path.join(SRC, 'flags.svg');
    if (fs.existsSync(flagsSvg)) {
        copy(flagsSvg, path.join(DIST, 'flags.svg'));
    }
    const nffCrest = path.join(SRC, 'NFF_Crest_01_Gradient_CMYK.png');
    if (fs.existsSync(nffCrest)) {
        copy(nffCrest, path.join(DIST, 'nff-crest.png'));
    }
    const ogImage = path.join(SRC, 'og-image.png');
    if (fs.existsSync(ogImage)) {
        copy(ogImage, path.join(DIST, 'og-image.png'));
    }

    write(path.join(DIST, 'robots.txt'),
`User-agent: *
Allow: /
Sitemap: https://em28.asskildt.eu/sitemap.xml
`);

    const mapSvg = path.join(SRC, 'map.svg');
    if (fs.existsSync(mapSvg)) {
        copy(mapSvg, path.join(DIST, 'map.svg'));
    }
}

// ── Kjør build ────────────────────────────────────────────────────────────────

console.log(`\nBuilding UEFA EM 2028${LANG_BUILD ? ` [LANG: ${LANG_BUILD}]` : ''}...`);
try {
    if (!LANG_BUILD) buildFlagSprite();
    const { matchesRaw, teamsData, stadiumsData } = buildDataJS();
    buildHTML(matchesRaw, stadiumsData, teamsData);
    copyStatic();
    if (!LANG_BUILD) buildSharePages(matchesRaw, teamsData, stadiumsData);
    console.log('\nDone.\n');
} catch (err) {
    console.error('\nBuild failed:', err.message);
    process.exit(1);
}
