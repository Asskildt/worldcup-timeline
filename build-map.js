#!/usr/bin/env node
// Genererer SVG-kart over Storbritannia og Irland med 9 EM-arenaer
// Kjøres av build.js og skriver til src/map.svg

const fs = require('fs');
const path = require('path');

// ── Koordinat-parsing ──────────────────────────────────────────────────────────
function parseDMS(str) {
    if (!str) return null;
    str = str.trim();
    // Desimalformat: "51.55°N 0.28°W"
    let m = str.match(/^([\d.]+)°([NS])\s+([\d.]+)°([EW])$/);
    if (m) {
        let lat = parseFloat(m[1]); if (m[2] === 'S') lat = -lat;
        let lon = parseFloat(m[3]); if (m[4] === 'W') lon = -lon;
        return { lat, lon };
    }
    // DMS: "51°33'21\"N 0°16'47\"W"
    m = str.match(/^(\d+)°(\d+)'([\d.]+)"([NS])\s+(\d+)°(\d+)'([\d.]+)"([EW])$/);
    if (m) {
        let lat = parseInt(m[1]) + parseInt(m[2])/60 + parseFloat(m[3])/3600;
        if (m[4] === 'S') lat = -lat;
        let lon = parseInt(m[5]) + parseInt(m[6])/60 + parseFloat(m[7])/3600;
        if (m[8] === 'W') lon = -lon;
        return { lat, lon };
    }
    return null;
}

// ── Mercator-projeksjon til SVG-koordinater ────────────────────────────────────
// Bounding box: dekker Storbritannia og Irland
const MAP_W = 500, MAP_H = 650;
const LON_MIN = -11, LON_MAX = 2.5;
const LAT_MIN = 50,  LAT_MAX = 59;

function lonLatToXY(lon, lat) {
    const x = (lon - LON_MIN) / (LON_MAX - LON_MIN) * MAP_W;
    const latRad = lat * Math.PI / 180;
    const yMerc = Math.log(Math.tan(Math.PI/4 + latRad/2));
    const latMinR = LAT_MIN * Math.PI / 180;
    const latMaxR = LAT_MAX * Math.PI / 180;
    const yMercMin = Math.log(Math.tan(Math.PI/4 + latMinR/2));
    const yMercMax = Math.log(Math.tan(Math.PI/4 + latMaxR/2));
    const y = (1 - (yMerc - yMercMin) / (yMercMax - yMercMin)) * MAP_H;
    return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
}

// ── GeoJSON → SVG paths ────────────────────────────────────────────────────────
function simplify(coords, step = 2) {
    const result = [];
    for (let i = 0; i < coords.length; i += step) {
        result.push(coords[i]);
    }
    if (result[0] && coords[coords.length-1]) result.push(coords[0]);
    return result;
}

function ringToPath(ring, step = 2) {
    const simplified = simplify(ring, step);
    if (simplified.length < 3) return '';
    let d = '';
    simplified.forEach(([lon, lat], i) => {
        if (lon < LON_MIN - 5 || lon > LON_MAX + 5 || lat < LAT_MIN - 5 || lat > LAT_MAX + 5) return;
        const {x, y} = lonLatToXY(lon, lat);
        d += (i === 0 ? `M${x},${y}` : `L${x},${y}`);
    });
    return d ? d + 'Z' : '';
}

function featureToPath(feature, step = 2) {
    if (!feature) return '';
    const geo = feature.geometry;
    let paths = [];

    function processPolygon(rings) {
        const p = ringToPath(rings[0], step);
        if (p) paths.push(p);
    }

    if (geo.type === 'Polygon') {
        processPolygon(geo.coordinates);
    } else if (geo.type === 'MultiPolygon') {
        geo.coordinates.forEach(polygon => {
            processPolygon(polygon);
        });
    }

    return paths.join(' ');
}

// ── Bygg SVG ──────────────────────────────────────────────────────────────────
function buildMapSVG() {
    const world = JSON.parse(fs.readFileSync(
        path.join(__dirname, 'src/data/world.json'), 'utf8'
    ));
    const stadiumsData = JSON.parse(fs.readFileSync(
        path.join(__dirname, 'src/data/stadiums.json'), 'utf8'
    ));

    // Finn UK og Irland
    const uk = world.features.find(f =>
        f.properties.name === 'United Kingdom' ||
        f.properties.name === 'Great Britain' ||
        f.properties.iso_a2 === 'GB'
    );
    const ireland = world.features.find(f =>
        f.properties.name === 'Ireland' ||
        f.properties.iso_a2 === 'IE'
    );

    const ukPath = featureToPath(uk, 3);
    const irelandPath = featureToPath(ireland, 3);

    // Arena-koordinater
    const arenas = stadiumsData.stadiums.map(s => {
        const coords = parseDMS(s.coords);
        if (!coords) return null;
        const { x, y } = lonLatToXY(coords.lon, coords.lat);
        return { ...s, x, y };
    }).filter(Boolean);

    // Farger per region
    const regionColors = {
        'London':     { dot: '#4a9eff', dotLight: '#1a5db5' },
        'North West': { dot: '#ff6b6b', dotLight: '#c03030' },
        'North East': { dot: '#ffaa44', dotLight: '#c06000' },
        'Midlands':   { dot: '#44cc88', dotLight: '#0a7a40' },
        'Wales':      { dot: '#e84040', dotLight: '#a02020' },
        'Scotland':   { dot: '#8855ff', dotLight: '#5522cc' },
        'Ireland':    { dot: '#44bb55', dotLight: '#1a7a30' },
    };
    const defaultCol = { dot: '#4a9eff', dotLight: '#1a5db5' };

    // Bygg arena-prikker og labels
    const arenaDots = arenas.map(a => {
        const col = regionColors[a.region] || defaultCol;
        const regionClass = (a.region || 'default').toLowerCase().replace(/\s+/g, '-');
        return `
        <g class="arena-dot" data-code="${a.code}" onclick="openVenueModal('${a.code}')" style="cursor:pointer">
            <circle cx="${a.x}" cy="${a.y}" r="8" fill="${col.dot}" class="arena-circle-${regionClass}" stroke="rgba(0,0,0,.4)" stroke-width="1.2" opacity=".95"/>
            <text x="${a.x}" y="${a.y - 12}" text-anchor="middle" font-family="Space Mono,monospace" font-size="11" fill="${col.dot}" class="arena-label-${regionClass}" opacity=".9" stroke="var(--map-sea)" stroke-width="2.5" paint-order="stroke">${a.city}</text>
        </g>`;
    }).join('');

    // CSS for lys modus
    const lightStyles = Object.entries(regionColors).map(([region, col]) => {
        const cls = region.toLowerCase().replace(/\s+/g, '-');
        return `      [data-theme="light"] .arena-circle-${cls} { fill: ${col.dotLight}; }
      [data-theme="light"] .arena-label-${cls}  { fill: ${col.dotLight}; }`;
    }).join('\n');

    const svg = `<svg id="arena-map" viewBox="0 0 ${MAP_W} ${MAP_H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block">
  <defs>
    <filter id="arena-map-shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="1" dy="2" stdDeviation="3" flood-color="#000" flood-opacity=".4"/>
    </filter>
    <style>
      :root { --map-sea:#04091a; --map-uk:#0a1030; --map-ie:#0d1a18; --map-stroke:#1a3070; }
      [data-theme="light"] {
        --map-sea:#c8d8f0;
        --map-uk:#bdd0eb;
        --map-ie:#c0d5c8;
        --map-stroke:#5878a8;
      }
${lightStyles}
      .arena-dot:hover circle { r: 10; opacity: 1; }
    </style>
  </defs>
  <!-- Havbakgrunn -->
  <rect width="${MAP_W}" height="${MAP_H}" fill="var(--map-sea)" rx="4"/>
  <!-- United Kingdom -->
  <path d="${ukPath}" fill="var(--map-uk)" stroke="var(--map-stroke)" stroke-width=".8" filter="url(#arena-map-shadow)"/>
  <!-- Ireland -->
  <path d="${irelandPath}" fill="var(--map-ie)" stroke="var(--map-stroke)" stroke-width=".8" filter="url(#arena-map-shadow)"/>
  <!-- Arenaer -->
  ${arenaDots}
</svg>`;

    fs.writeFileSync(path.join(__dirname, 'src/map.svg'), svg);
    console.log(`  ✓ src/map.svg (${arenas.length} arenaer)`);
    return svg;
}

module.exports = { buildMapSVG };

if (require.main === module) {
    buildMapSVG();
}
