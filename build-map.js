#!/usr/bin/env node
// Genererer SVG-kart over Nord-Amerika med 16 VM-arenaer
// Kjøres av build.js og skriver til src/map.svg

const fs = require('fs');
const path = require('path');

// ── Koordinat-parsing ──────────────────────────────────────────────────────────
function parseDMS(str) {
    if (!str) return null;
    str = str.trim();
    // Desimalformat: "47.595°N 122.331°W"
    let m = str.match(/^([\d.]+)°([NS])\s+([\d.]+)°([EW])$/);
    if (m) {
        let lat = parseFloat(m[1]); if (m[2] === 'S') lat = -lat;
        let lon = parseFloat(m[3]); if (m[4] === 'W') lon = -lon;
        return { lat, lon };
    }
    // DMS: "49°16'36\"N 123°6'43\"W"
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
// Bounding box: lon -135 til -65, lat 15 til 60 (dekker USA/Canada/Mexico)
const MAP_W = 900, MAP_H = 520;
const LON_MIN = -130, LON_MAX = -65;
const LAT_MIN = 15,  LAT_MAX = 54;

function lonLatToXY(lon, lat) {
    const x = (lon - LON_MIN) / (LON_MAX - LON_MIN) * MAP_W;
    // Mercator Y (invertert — SVG Y øker nedover)
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
// Forenkler ved å ta kun hvert N-te punkt (reduserer kompleksitet)
function simplify(coords, step = 3) {
    const result = [];
    for (let i = 0; i < coords.length; i += step) {
        result.push(coords[i]);
    }
    // Sørg for at siste punkt matches første for lukket polygon
    if (result[0] && coords[coords.length-1]) result.push(coords[0]);
    return result;
}

function ringToPath(ring, step = 3) {
    const simplified = simplify(ring, step);
    if (simplified.length < 3) return '';
    let d = '';
    simplified.forEach(([lon, lat], i) => {
        // Filtrer punkter utenfor bounding box
        if (lon < LON_MIN - 5 || lon > LON_MAX + 5 || lat < LAT_MIN - 5 || lat > LAT_MAX + 5) return;
        const {x, y} = lonLatToXY(lon, lat);
        d += (i === 0 ? `M${x},${y}` : `L${x},${y}`);
    });
    return d ? d + 'Z' : '';
}

function featureToPath(feature, step = 3) {
    const geo = feature.geometry;
    let paths = [];

    function processPolygon(rings) {
        // Hopp over polygoner der alle punkter er nord for LAT_MAX (Arktis-øyer)
        const firstRing = rings[0];
        const minLat = Math.min(...firstRing.map(c => c[1]));
        if (minLat > LAT_MAX) return;
        const p = ringToPath(rings[0], step);
        if (p) paths.push(p);
    }

    if (geo.type === 'Polygon') {
        processPolygon(geo.coordinates);
    } else if (geo.type === 'MultiPolygon') {
        geo.coordinates.forEach(polygon => {
            // Filtrer bort små øyer (polygoner med færre enn 20 punkter)
            if (polygon[0].length >= 20) processPolygon(polygon);
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

    // Finn de tre landene
    const countries = {
        usa: world.features.find(f => f.properties.name === 'United States of America'),
        canada: world.features.find(f => f.properties.name === 'Canada'),
        mexico: world.features.find(f => f.properties.name === 'Mexico'),
    };

    // Generer paths — step 8 for USA/Canada (store, mange punkter), 4 for Mexico
    const usaPath    = featureToPath(countries.usa,    8);
    const canadaPath = featureToPath(countries.canada, 8);
    const mexicoPath = featureToPath(countries.mexico, 4);

    // Arena-koordinater
    const arenas = stadiumsData.stadiums.map(s => {
        const coords = parseDMS(s.coords);
        if (!coords) return null;
        const { x, y } = lonLatToXY(coords.lon, coords.lat);
        return { ...s, x, y };
    }).filter(Boolean);

    // Farger per region — separate sett for mørk og lys modus
    const regionColors = {
        Western:  { fill: '#0d2a4a', stroke: '#1a4888', dot: '#4a9eff', dotLight: '#1a5db5' },
        Central:  { fill: '#2a1a00', stroke: '#6a4010', dot: '#ffaa44', dotLight: '#c06000' },
        Eastern:  { fill: '#0a2818', stroke: '#1a5830', dot: '#44cc88', dotLight: '#0a7a40' },
    };

    // Bygg arena-prikker og labels
    const arenaDots = arenas.map(a => {
        const col = regionColors[a.region] || regionColors.Eastern;
        const cityName = a.city.split('/')[0].split('(')[0].trim();
        return `
        <g class="arena-dot" data-code="${a.code}" onclick="openVenueModal('${a.code}')" style="cursor:pointer">
            <circle cx="${a.x}" cy="${a.y}" r="8" fill="${col.dot}" class="arena-circle-${a.region.toLowerCase()}" stroke="rgba(0,0,0,.4)" stroke-width="1.2" opacity=".95"/>
            <text x="${a.x}" y="${a.y - 12}" text-anchor="middle" font-family="Space Mono,monospace" font-size="11" fill="${col.dot}" class="arena-label-${a.region.toLowerCase()}" opacity=".9" stroke="var(--map-sea)" stroke-width="2.5" paint-order="stroke">${cityName}</text>
        </g>`;
    }).join('');

    const svg = `<svg id="arena-map" viewBox="0 0 ${MAP_W} ${MAP_H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block">
  <defs>
    <filter id="arena-map-shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="1" dy="2" stdDeviation="3" flood-color="#000" flood-opacity=".4"/>
    </filter>
    <style>
      :root { --map-sea:#04091a; --map-ca:#070d24; --map-us:#0a1030; --map-mx:#0d1a18; --map-stroke:#1a3070; }
      [data-theme="light"] {
        --map-sea:#c8d8f0;
        --map-ca:#d8e6f8;
        --map-us:#bdd0eb;
        --map-mx:#c0d5c8;
        --map-stroke:#5878a8;
      }
      /* Arena-dot og label farger — lys modus bruker mørkere variantene */
      [data-theme="light"] .arena-circle-western  { fill: #1a5db5; }
      [data-theme="light"] .arena-label-western   { fill: #1a5db5; }
      [data-theme="light"] .arena-circle-central  { fill: #b05000; }
      [data-theme="light"] .arena-label-central   { fill: #b05000; }
      [data-theme="light"] .arena-circle-eastern  { fill: #0a7a40; }
      [data-theme="light"] .arena-label-eastern   { fill: #0a7a40; }
      .arena-dot:hover circle { r: 10; opacity: 1; }
    </style>
  </defs>
  <!-- Havbakgrunn -->
  <rect width="${MAP_W}" height="${MAP_H}" fill="var(--map-sea)" rx="4"/>
  <!-- Canada -->
  <path d="${canadaPath}" fill="var(--map-ca)" stroke="var(--map-stroke)" stroke-width=".8" filter="url(#arena-map-shadow)"/>
  <!-- USA -->
  <path d="${usaPath}" fill="var(--map-us)" stroke="var(--map-stroke)" stroke-width=".8" filter="url(#arena-map-shadow)"/>
  <!-- Mexico -->
  <path d="${mexicoPath}" fill="var(--map-mx)" stroke="var(--map-stroke)" stroke-width=".8" filter="url(#arena-map-shadow)"/>
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
