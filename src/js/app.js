// ── Konfig ────────────────────────────────────────────────────────────────────
const TL_START  = 17.5; // 17:30 CEST
const TL_END    = 32.5; // 08:30 neste dag
const TL_COLS   = (TL_END - TL_START) * 2;
const TL_STEP   = 0.5;
const MATCH_DUR = 2.0;
const API_URL   = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';
const FETCH_TIMEOUT_MS = 8000;

// VM starter 11. juni 2026 kl. 21:00 CEST = 19:00 UTC
const VM_START_UTC = new Date('2026-06-11T19:00:00Z');

// ── State ─────────────────────────────────────────────────────────────────────
let MATCHES = [];
let NORWAY_POTENTIAL_MATCHES = new Set(); // kamp-num for potensielle Norge-kamper
let FAVORITE_TEAMS = JSON.parse(localStorage.getItem('favoriteTeams') || '["Norway"]');
let ACTIVE_FILTER = null; // { type: 'team'|'group', value: 'Norway'|'A' }
let HIGHLIGHTS_ON = localStorage.getItem('highlightsOn') !== 'false'; // default true
// Kompakt-tilstand er separat per modus — husket uavhengig
// horisontal tidslinje: default false (utvidet) på desktop, uendret hvis satt
// vertikal rutenett:    default true (kompakt) på mobil, uendret hvis satt
let TL_COMPACT    = localStorage.getItem('tlCompact')  !== null
    ? localStorage.getItem('tlCompact') === 'true'
    : false;  // horisontal: utvidet som default
let VG_COMPACT    = localStorage.getItem('vgCompact')  !== null
    ? localStorage.getItem('vgCompact') === 'true'
    : window.innerWidth <= 700;   // kompakt kun på mobil som default
let TBL_REST_DAYS = localStorage.getItem('tblRestDays') !== 'false'; // default true
// TL_MODE: auto-detect ved første besøk — mobil (<=700px) → vertikal, desktop → horisontal
let TL_MODE = localStorage.getItem('tlMode') !== null
    ? localStorage.getItem('tlMode')
    : (window.innerWidth <= 700 ? 'vertical' : 'horizontal');

// Tidssoner — offset fra UTC, label, og lokal tidssone-forkortelse
// HOME_TZ_IDX markerer "standard"-tidssonen for denne installasjon (CEST for norsk versjon)
const TZ_LIST = [
    { offset:  2, label: 'CEST',  flag: 'no',     desc: 'Norge, Sentral-Europa',           descEn: 'Norway, Central Europe',          home: true  },
    { offset:  1, label: 'BST',   flag: 'gb-eng',  desc: 'Storbritannia, Irland',            descEn: 'UK, Ireland',                     home: false },
    { offset:  3, label: 'UTC+3', flag: 'sa',      desc: 'Øst-Europa, Midtøsten, E-Afrika', descEn: 'E. Europe, Middle East, E. Africa',home: false },
    { offset: -3, label: 'BRT',   flag: 'br',      desc: 'Brasil, Argentina',               descEn: 'Brazil, Argentina',               home: false },
    { offset: -4, label: 'EDT',   flag: 'ca',      desc: 'New York, Toronto',               descEn: 'New York, Toronto',               home: false },
    { offset: -5, label: 'CDT',   flag: 'us',      desc: 'Chicago, Mexico City',            descEn: 'Chicago, Mexico City',            home: false },
    { offset: -6, label: 'MDT',   flag: 'us',      desc: 'Denver',                          descEn: 'Denver',                          home: false },
    { offset: -7, label: 'PDT',   flag: 'us',      desc: 'Los Angeles, Vancouver',          descEn: 'Los Angeles, Vancouver',          home: false },
    { offset:  0, label: 'UTC',   flag: null,       desc: 'UTC',                             descEn: 'UTC',                             home: false },
];
// Auto-detect timezone index from browser, falls back to CEST (0)
function detectTZIdx() {
    try {
        const offsetMin = -new Date().getTimezoneOffset(); // minutes east of UTC
        const offsetH   = offsetMin / 60;
        // Find closest match in TZ_LIST
        let best = 0, bestDiff = Infinity;
        TZ_LIST.forEach((tz, i) => {
            const diff = Math.abs(tz.offset - offsetH);
            if (diff < bestDiff) { bestDiff = diff; best = i; }
        });
        return best;
    } catch (e) { return 0; }
}

let TZ_IDX = (() => {
    const stored = localStorage.getItem('tzIdx');
    if (stored !== null) {
        const n = parseInt(stored, 10);
        return (n >= 0 && n < TZ_LIST.length) ? n : 0;
    }
    return detectTZIdx();
})();

function currentTZ() { return TZ_LIST[TZ_IDX]; }

// Konverter CEST-desimaltimer til valgt tidssone
function toLocalT(t) {
    if (t == null) return t;
    const tz = currentTZ();
    return t + (tz.offset - 2); // CEST = UTC+2
}

function setTZ(idx) {
    TZ_IDX = idx;
    localStorage.setItem('tzIdx', String(TZ_IDX));
    closeTZMenu();
    const btn = document.getElementById('tz-label');
    if (btn) btn.textContent = currentTZ().label;
    buildTimeline();
    buildTable();
    if (document.getElementById('vg')?.dataset.built) buildVerticalGrid();
}

function toggleTZMenu() {
    const menu = document.getElementById('tz-menu');
    const btn  = document.getElementById('tz-toggle');
    if (!menu) return;
    const open = menu.style.display !== 'none';
    if (open) {
        closeTZMenu();
    } else {
        // Bygg menyinnhold
        menu.innerHTML = TZ_LIST.map((tz, i) => {
            const off  = tz.offset >= 0 ? `+${tz.offset}` : `${tz.offset}`;
            const desc = (LANG !== 'no' && tz.descEn) ? tz.descEn : tz.desc;
            return `<button class="tz-menu-item${i === TZ_IDX ? ' selected' : ''}" onclick="setTZ(${i})">
                ${tz.home ? '<i class="bi bi-star-fill tz-home-star"></i>' : '<span class="tz-star-placeholder"></span>'}
                ${tz.flag ? `<svg class="flag-svg tz-flag" aria-hidden="true"><use href="#${tz.flag}"/></svg>` : '<span class="tz-flag-placeholder"></span>'}
                <span class="tz-label-text">${tz.label}</span>
                <span class="tz-offset">${off}</span>
                <span class="tz-desc">${desc}</span>
            </button>`;
        }).join('');
        menu.style.position = 'fixed';
        menu.style.display = 'block';
        _positionMenu(btn, menu);
        btn?.setAttribute('aria-expanded', 'true');
        _showBackdrop();
        setTimeout(() => document.addEventListener('pointerdown', _tzOutsideHandler, true), 0);
    }
}

function _tzOutsideHandler(e) {
    const wrap = document.getElementById('tz-menu')?.closest('.tz-wrap');
    if (wrap && wrap.contains(e.target)) return;
    closeTZMenu();
    document.removeEventListener('pointerdown', _tzOutsideHandler, true);
}

function _showBackdrop() {
    const bd = document.getElementById('tz-backdrop');
    if (bd) bd.style.display = 'block';
}
function _hideBackdrop() {
    const bd = document.getElementById('tz-backdrop');
    if (bd) bd.style.display = 'none';
}

// Posisjonerer en meny ved sin knapp — åpner ned eller opp avhengig av plass,
// og klipper mot viewport-kantene horisontalt.
function _positionMenu(btnEl, menuEl) {
    // Reset for å måle naturlig størrelse
    menuEl.style.top    = '';
    menuEl.style.bottom = '';
    menuEl.style.left   = '';
    menuEl.style.right  = '';
    menuEl.style.maxHeight = '';

    const btnRect  = btnEl.getBoundingClientRect();
    const menuH    = menuEl.offsetHeight;
    const menuW    = menuEl.offsetWidth;
    const vw       = window.innerWidth;
    const vh       = window.innerHeight;
    const gap      = 4;
    const margin   = 8; // minimum avstand til viewport-kant

    // Åpne ned eller opp?
    const spaceBelow = vh - btnRect.bottom - gap;
    const spaceAbove = btnRect.top - gap;
    const openDown   = spaceBelow >= menuH || spaceBelow >= spaceAbove;

    if (openDown) {
        const maxH = Math.min(menuH, spaceBelow - margin);
        menuEl.style.top       = (btnRect.bottom + gap + window.scrollY) + 'px';
        menuEl.style.maxHeight = maxH + 'px';
    } else {
        const maxH = Math.min(menuH, spaceAbove - margin);
        menuEl.style.top       = (btnRect.top - gap - Math.min(menuH, maxH) + window.scrollY) + 'px';
        menuEl.style.maxHeight = maxH + 'px';
    }

    // Horisontal: prøv å flukte høyre kant med knappen, klipp mot viewport
    let left = btnRect.right - menuW;
    left = Math.max(margin, Math.min(left, vw - menuW - margin));
    menuEl.style.left = (left + window.scrollX) + 'px';
}

function closeTZMenu() {
    const menu = document.getElementById('tz-menu');
    const btn  = document.getElementById('tz-toggle');
    if (menu) menu.style.display = 'none';
    btn?.setAttribute('aria-expanded', 'false');
    _hideBackdrop();
}

function initTZ() {
    const lbl = document.getElementById('tz-label');
    if (lbl) lbl.textContent = currentTZ().label;
}

function initLang() {
    const btn = document.getElementById('lang-toggle');
    if (btn) btn.querySelector('.tz-label-text').textContent = LANG.toUpperCase();
}

// ── Språk / Language ──────────────────────────────────────────────────────────
// detectLang og LANG initialiseres etter i18n-objektet (se nedenfor)

const i18n = {
    no: {
        days:       ['Søn','Man','Tir','Ons','Tor','Fre','Lør'],
        months:     ['jan','feb','mar','apr','mai','jun','jul','aug','sep','okt','nov','des'],
        sec_group:  'Gruppespill',
        sec_r32:    '16-delsfinaler',
        sec_r16:    'Åttedelsfinaler',
        sec_qf:     'Kvartfinaler',
        sec_sf:     'Semifinaler',
        sec_fin:    'Finale',
        grp_r32:    '16-delsfinale',
        grp_r16:    'Åttedelsfinale',
        grp_qf:     'Kvartfinale',
        grp_sf:     'Semifinale',
        grp_3p:     'Bronsefinale',
        grp_fin:    'Finale',
        grp_prefix: 'Gruppe ',
        match_num:  'Kamp #',
        not_played: 'Ikke spilt',
        et:         'e.f.',
        pen:        'str.',
        own_goal:   'selvmål',
        seats:      'plasser',
        region:     'Region',
        live:       'LIVE',
        night_to:   'Natt til',
        update:     'Henter resultater…',
        timeout:    'Tidsavbrudd',
        updated_at: 'Oppdatert',
        results:    'resultater',
        filter:     'Filter',
        reset:      'Nullstill',
        favourites: 'Favoritter',
        show_tl:    'Vis i tidslinje',
        group_lbl:  'Gruppe',
        compact:    'Kompakt visning',
        expanded_v: 'Utvidet visning',
        hide_rest:  'Skjul hviledager',
        show_rest:  'Vis hviledager',
        hide_hl:    'Skru av highlight',
        show_hl:    'Skru på highlight',
        load_more:  'Last inn tidligere kamper',
        scroll_hint:'Scroll horisontalt for å se alle kamper',
        scroll_hint_vg: 'Scroll horisontalt for å se alle datoer',
        matches:    'kamper',
        matches_n:  (n) => `${n} kamp${n !== 1 ? 'er' : ''} spilt`,
        standings:  'Gruppe',
        best_thirds:'Beste treere',
        thirds_note:(n) => `4 av ${n} treere går videre · Rangert etter poeng, målforskjell og mål scoret`,
        third_pts:  (p) => `${p}p`,
        third_goals:(g) => `${g} mål`,
        adv:        'MF',
        pts:        'P',
        rest_days:  (n) => `— ${n} dager hvile —`,
        scorers_note: 'Kun kamper med scorer-data',
        tab_timeline:'Tidslinje',
        tab_grid:   'Rutenett',
        tab_table:  'Tabell',
        tab_groups: 'Grupper',
        tab_arenas: 'Arenaer',
        tab_bracket:'Sluttspill',
        tab_stats:  'Statistikk',
        theme_sys:  'System',
        theme_day:  'Dag',
        theme_night:'Natt',
        st_norway:  (n) => `Norge — ${n} kamp${n !== 1 ? 'er' : ''} spilt`,
        st_wdl:     'V / U / T',
        st_goals:   'Mål for / mot',
        st_top:     'Toppscorer',
        st_topscorers: 'Toppscorere',
        st_highscoring: 'Høyest scorende kamper',
        st_teamgoals: 'Flest mål scoret (lag)',
        st_venues:  'Arenaer — flest mål',
        st_et_pen:  'Ekstraomganger og straffespill',
        st_et:      'Ekstraomganger',
        st_pen:     'Straffesparkkonkurranse',
        st_overview:'Oversikt',
        st_played:  'Kamper spilt',
        st_total_goals: 'Totalt mål',
        st_avg:     'Snitt mål/kamp',
        st_empty:   'Ingen resultater ennå — statistikk vises etter at kampene er spilt.',
        venue_matches: 'Kamper',
        add_fav:    'Legg til',
        fav_active: 'Favoritt',
        share_page: 'FIFA VM 2026 – Kampprogram',
        share_text: 'Se alle kampene, stillingene og sluttspillet for VM 2026 med norsk tid.',
        copy_link:  'Kopier lenken:',
        map_note:   'Klikk på en arena for å se kampene der',
        no_map:     'Kart ikke tilgjengelig',
        arena_btn:  'Arena',
        tz_label:   'Tidssone',
        lang_btn:   'EN',
        fav_count:      (n) => `Favoritter (${n})`,
        ko_paths_title: 'Hvem kan komme hit?',
        ko_winner_of:   'Vinneren av',
        ko_loser_of:    'Taperen av',
    },
    en: {
        days:       ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
        months:     ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
        sec_group:  'Group stage',
        sec_r32:    'Round of 32',
        sec_r16:    'Round of 16',
        sec_qf:     'Quarter-finals',
        sec_sf:     'Semi-finals',
        sec_fin:    'Final',
        grp_r32:    'Round of 32',
        grp_r16:    'Round of 16',
        grp_qf:     'Quarter-final',
        grp_sf:     'Semi-final',
        grp_3p:     'Third-place play-off',
        grp_fin:    'Final',
        grp_prefix: 'Group ',
        match_num:  'Match #',
        not_played: 'Not played',
        et:         'a.e.t.',
        pen:        'pens.',
        own_goal:   'o.g.',
        seats:      'seats',
        region:     'Region',
        live:       'LIVE',
        night_to:   'Early hours of',
        update:     'Fetching results…',
        timeout:    'Timed out',
        updated_at: 'Updated',
        results:    'results',
        filter:     'Filter',
        reset:      'Clear',
        favourites: 'Favourites',
        show_tl:    'Show in timeline',
        group_lbl:  'Group',
        compact:    'Compact view',
        expanded_v: 'Expanded view',
        hide_rest:  'Hide rest days',
        show_rest:  'Show rest days',
        hide_hl:    'Turn off highlights',
        show_hl:    'Turn on highlights',
        load_more:  'Load earlier matches',
        scroll_hint:'Scroll horizontally to see all matches',
        scroll_hint_vg: 'Scroll horizontally to see all dates',
        matches:    'matches',
        matches_n:  (n) => `${n} match${n !== 1 ? 'es' : ''} played`,
        standings:  'Group',
        best_thirds:'Best third-placed teams',
        thirds_note:(n) => `4 of ${n} third-placed teams advance · Ranked by points, goal difference and goals scored`,
        third_pts:  (p) => `${p}pts`,
        third_goals:(g) => `${g} goals`,
        adv:        'GD',
        pts:        'P',
        rest_days:  (n) => `— ${n} day${n !== 1 ? 's' : ''} rest —`,
        scorers_note: 'Only matches with scorer data',
        tab_timeline:'Timeline',
        tab_grid:   'Grid',
        tab_table:  'Table',
        tab_groups: 'Groups',
        tab_arenas: 'Venues',
        tab_bracket:'Bracket',
        tab_stats:  'Stats',
        theme_sys:  'System',
        theme_day:  'Light',
        theme_night:'Dark',
        st_norway:  (n) => `Norway — ${n} match${n !== 1 ? 'es' : ''} played`,
        st_wdl:     'W / D / L',
        st_goals:   'Goals for / against',
        st_top:     'Top scorer',
        st_topscorers: 'Top scorers',
        st_highscoring: 'Highest-scoring matches',
        st_teamgoals: 'Most goals scored (teams)',
        st_venues:  'Venues — most goals',
        st_et_pen:  'Extra time & penalties',
        st_et:      'Extra time',
        st_pen:     'Penalty shootout',
        st_overview:'Overview',
        st_played:  'Matches played',
        st_total_goals: 'Total goals',
        st_avg:     'Avg goals/match',
        st_empty:   'No results yet — statistics will appear once matches are played.',
        venue_matches: 'Matches',
        add_fav:    'Add',
        fav_active: 'Favourite',
        share_page: 'FIFA World Cup 2026 – Schedule',
        share_text: 'See all matches, standings and the knockout bracket for World Cup 2026.',
        copy_link:  'Copy the link:',
        map_note:   'Click a venue to see its matches',
        no_map:     'Map not available',
        arena_btn:  'Venue',
        tz_label:   'Timezone',
        lang_btn:   'NO',
        fav_count:      (n) => `Favourites (${n})`,
        ko_paths_title: 'Who can qualify here?',
        ko_winner_of:   'Winner of',
        ko_loser_of:    'Loser of',
    }
};

// Auto-detect language from browser. Norwegian only for Norwegian browsers,
// English for everyone else (including unsupported languages like German).
function detectLang() {
    const langs = navigator.languages || [navigator.language || ''];
    for (const l of langs) {
        const code = l.toLowerCase().split('-')[0];
        if (code === 'no' || code === 'nb' || code === 'nn') return 'no';
        if (i18n[code]) return code;
    }
    return 'en'; // default for all non-Norwegian browsers
}

let LANG = (() => {
    const stored = localStorage.getItem('lang');
    return (stored && i18n[stored]) ? stored : detectLang();
})();

// ── URL-parametere: ?lang= og ?tz= overstyrer localStorage ───────────────────
// Leses én gang ved oppstart, lagres i localStorage, fjernes fra URL.
(function applyURLParams() {
    const params = new URLSearchParams(location.search);
    let changed = false;

    // ?lang=en | ?lang=no
    const langParam = params.get('lang');
    if (langParam && i18n[langParam]) {
        localStorage.setItem('lang', langParam);
        LANG = langParam;
        params.delete('lang');
        changed = true;
    }

    // ?tz=CEST | ?tz=EDT | ?tz=PDT etc. (label-match, case-insensitive)
    const tzParam = params.get('tz');
    if (tzParam) {
        const idx = TZ_LIST.findIndex(tz => tz.label.toLowerCase() === tzParam.toLowerCase());
        if (idx !== -1) {
            localStorage.setItem('tzIdx', String(idx));
            TZ_IDX = idx;
            params.delete('tz');
            changed = true;
        }
    }

    // Fjern parameterne fra URL uten å legge til history-entry
    if (changed) {
        const newSearch = params.toString();
        const newURL = location.pathname + (newSearch ? '?' + newSearch : '') + location.hash;
        history.replaceState(null, '', newURL);
    }
})();

function t(key, ...args) {
    const s = i18n[LANG]?.[key] ?? i18n.no[key];
    return typeof s === 'function' ? s(...args) : (s ?? key);
}

// Returnerer lokalisert lagnavn: name_no på norsk, engelsk ellers
function teamName(name) {
    if (!name) return name;
    if (LANG === 'no') {
        const td = TEAMS[name];
        return (td && td.name_no) ? td.name_no : name;
    }
    return name;
}

function toggleLangMenu() {
    const menu = document.getElementById('lang-menu');
    const btn  = document.getElementById('lang-toggle');
    if (!menu) return;
    const open = menu.style.display !== 'none';
    if (open) {
        closeLangMenu();
    } else {
        // Supported languages in display order
        const LANGS = [
            { code: 'no', label: 'NO', flag: 'no', name: 'Norsk' },
            { code: 'en', label: 'EN', flag: 'gb-eng', name: 'English' },
        ];
        menu.innerHTML = LANGS.map(l =>
            `<button class="tz-menu-item lang-menu-item${l.code === LANG ? ' selected' : ''}" onclick="setLang('${l.code}')">
                <span class="tz-star-placeholder"></span>
                ${l.flag ? `<svg class="flag-svg tz-flag" aria-hidden="true"><use href="#${l.flag}"/></svg>` : '<span class="tz-flag-placeholder"></span>'}
                <span class="tz-label-text">${l.label}</span>
                <span class="tz-desc">${l.name}</span>
            </button>`
        ).join('');
        menu.style.position = 'fixed';
        menu.style.display = 'block';
        _positionMenu(btn, menu);
        btn?.setAttribute('aria-expanded', 'true');
        _showBackdrop();
        setTimeout(() => document.addEventListener('pointerdown', _langOutsideHandler, true), 0);
    }
}

function _langOutsideHandler(e) {
    const wrap = document.getElementById('lang-menu')?.closest('.tz-wrap');
    if (wrap && wrap.contains(e.target)) return;
    closeLangMenu();
    document.removeEventListener('pointerdown', _langOutsideHandler, true);
}

function closeLangMenu() {
    const menu = document.getElementById('lang-menu');
    const btn  = document.getElementById('lang-toggle');
    if (menu) menu.style.display = 'none';
    btn?.setAttribute('aria-expanded', 'false');
    _hideBackdrop();
}

function setLang(code) {
    closeLangMenu();
    if (!i18n[code] || code === LANG) return;
    LANG = code;
    localStorage.setItem('lang', LANG);
    // Update button label
    const btn = document.getElementById('lang-toggle');
    if (btn) btn.querySelector('.tz-label-text').textContent = code.toUpperCase();
    // Rebuild everything
    buildTimeline();
    buildTable();
    buildGroups();
    buildNorwaySchedule();
    renderTlToolbar();
    // Update tab labels
    const tabIds   = ['timeline','table','groups','arenas','bracket'];
    const tabIcons = ['bi-bar-chart-steps','bi-list-ul','bi-grid-3x3-gap','bi-geo-alt','bi-diagram-3'];
    const tabKeys  = ['tab_timeline','tab_table','tab_groups','tab_arenas','tab_bracket'];
    tabIds.forEach((id, i) => {
        const tabBtn = document.getElementById('tab-' + id);
        if (tabBtn) tabBtn.innerHTML = `<i class="bi ${tabIcons[i]}"></i> ${t(tabKeys[i])}`;
    });
    // Update theme labels
    applyTheme(currentTheme);
    // Rebuild other views if already built
    if (document.getElementById('bracket-built')) buildBracket();
    if (document.getElementById('stats-built')?.children.length) buildStats();
    if (document.getElementById('arenas-built')) buildArenas();
    if (document.getElementById('vg-built')) buildVerticalGrid();
}

function saveFavorites() {
    localStorage.setItem('favoriteTeams', JSON.stringify(FAVORITE_TEAMS));
}
function saveHighlights() {
    localStorage.setItem('highlightsOn', String(HIGHLIGHTS_ON));
}
function saveTlCompact() {
    localStorage.setItem('tlCompact', String(TL_COMPACT));
}
function toggleTlCompact() {
    TL_COMPACT = !TL_COMPACT;
    saveTlCompact();
    buildTimeline();
    renderTlToolbar();
}

function applyTlMode(mode) {
    TL_MODE = mode || TL_MODE;
    localStorage.setItem('tlMode', TL_MODE);
    const isVert = TL_MODE === 'vertical';
    const tlEl = document.getElementById('tl-mode');
    const vgEl = document.getElementById('vg-mode');
    if (tlEl) tlEl.style.display = isVert ? 'none' : '';
    if (vgEl) vgEl.style.display = isVert ? '' : 'none';
    if (isVert) {
        buildVerticalGrid();
    } else {
        buildTimeline();
        renderTlToolbar();
    }
}
function toggleTlMode() {
    applyTlMode(TL_MODE === 'horizontal' ? 'vertical' : 'horizontal');
}
// Inline SVG for transpose-ikonet (fra src/transpose.svg)
const TRANSPOSE_SVG = '<svg class="tl-mode-icon" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M19,26H14V24h5a5.0055,5.0055,0,0,0,5-5V14h2v5A7.0078,7.0078,0,0,1,19,26Z"/><path d="M8,30H4a2.0023,2.0023,0,0,1-2-2V14a2.0023,2.0023,0,0,1,2-2H8a2.0023,2.0023,0,0,1,2,2V28A2.0023,2.0023,0,0,1,8,30ZM4,14V28H8V14Z"/><path d="M28,10H14a2.0023,2.0023,0,0,1-2-2V4a2.0023,2.0023,0,0,1,2-2H28a2.0023,2.0023,0,0,1,2,2V8A2.0023,2.0023,0,0,1,28,10ZM14,4V8H28V4Z"/></svg>';
function saveTblRestDays() {
    localStorage.setItem('tblRestDays', String(TBL_REST_DAYS));
}

// ── (Header-kollaps fjernet — header er alltid synlig og kompakt) ─────────────

function updateCountdown() {
    const infoEl = document.getElementById('next-match-info');
    const norRow = document.getElementById('norway-next-row');
    const norInfo = document.getElementById('norway-next-info');
    const liveBadge = document.getElementById('live-badge');
    if (!infoEl) return;

    const now = Date.now();

    function fmtCountdown(diffMs) {
        const d = Math.floor(diffMs / 86400000);
        const h = Math.floor((diffMs % 86400000) / 3600000);
        const m = Math.floor((diffMs % 3600000) / 60000);
        const s = Math.floor((diffMs % 60000) / 1000);
        if (d > 0)   return `om ${d}d ${h}t`;
        if (h > 0)   return `om ${h}t ${m}m`;
        if (m > 0)   return `om ${m}m ${s}s`;
        return `om ${s}s`;
    }

    function buildMatchText(m) {
        const st = STADIUMS[m.v] || {};
        const startMs = cestToDate(m.isoDate, m.t).getTime();
        const diffMs  = Math.max(0, startMs - now);
        const isLive  = now >= startMs && now <= startMs + MATCH_DUR * 3600000;
        const countdown = isLive ? 'LIVE' : fmtCountdown(diffMs);
        const fifa1 = TEAMS[m.team1]?.fifa_code || m.team1.slice(0,3).toUpperCase();
        const fifa2 = TEAMS[m.team2]?.fifa_code || m.team2.slice(0,3).toUpperCase();
        return (
            `<span class="nm-date">${m.day} ${m.date} · </span>` +
            `<span class="nm-time">${fmtT(m.t)}</span>` +
            `<span class="nm-sep"> · </span>` +
            `<span class="nm-teams">${m.flag1} <span class="nm-name">${teamName(m.team1)}</span><span class="nm-fifa">${fifa1}</span>` +
            ` v ${m.flag2} <span class="nm-name">${teamName(m.team2)}</span><span class="nm-fifa">${fifa2}</span></span>` +
            `<span class="nm-city"> · ${st.city || m.ground}</span>` +
            `<span class="nm-countdown"> (<span class="nm-om">om </span>${countdown.replace(/^om /, '')})</span>`
        );
    }

    // Finn pågående eller neste kamp
    const live = MATCHES.find(m => {
        const s = cestToDate(m.isoDate, m.t).getTime();
        return now >= s && now <= s + MATCH_DUR * 3600000;
    });
    const next = live || MATCHES.find(m => cestToDate(m.isoDate, m.t).getTime() > now);

    if (!next) {
        infoEl.textContent = 'VM 2026 er over';
        if (liveBadge) liveBadge.style.display = 'none';
        if (norRow) norRow.style.display = 'none';
        return;
    }

    infoEl.innerHTML = buildMatchText(next);
    if (liveBadge) liveBadge.style.display = live ? 'inline' : 'none';

    // Neste Norge-kamp
    if (norRow && norInfo) {
        const norMatches = MATCHES.filter(m => m.team1 === 'Norway' || m.team2 === 'Norway');
        const nextNor = norMatches.find(m => {
            const s = cestToDate(m.isoDate, m.t).getTime();
            return s > now || (now >= s && now <= s + MATCH_DUR * 3600000);
        });
        if (!nextNor || nextNor === next) {
            norRow.style.display = 'none';
        } else {
            const opp = nextNor.team1 === 'Norway' ? nextNor.team2 : nextNor.team1;
            const oppFlag = nextNor.team1 === 'Norway' ? nextNor.flag2 : nextNor.flag1;
            const norSt = STADIUMS[nextNor.v] || {};
            const norStart = cestToDate(nextNor.isoDate, nextNor.t).getTime();
            const norDiff  = Math.max(0, norStart - now);
            const norLive  = now >= norStart && now <= norStart + MATCH_DUR * 3600000;
            const norCountdown = norLive ? 'LIVE' : fmtCountdown(norDiff);
            const oppFifa = TEAMS[opp]?.fifa_code || opp.slice(0,3).toUpperCase();
            norInfo.innerHTML =
                `<span class="nm-date">${nextNor.day} ${nextNor.date} · </span>` +
                `<span class="nm-time">${fmtT(nextNor.t)}</span>` +
                `<span class="nm-sep"> · </span>` +
                `${TEAMS['Norway']?.flag_id ? `<svg class="flag-svg" aria-hidden="true" style="height:1em"><use href="#${TEAMS['Norway'].flag_id}"/></svg>` : '🇳🇴'} ` +
                `<span class="nm-teams"><span class="nm-name">Norge</span><span class="nm-fifa">NOR</span>` +
                ` v ${oppFlag} <span class="nm-name">${opp}</span><span class="nm-fifa">${oppFifa}</span></span>` +
                `<span class="nm-city"> · ${norSt.city || nextNor.ground}</span>` +
                `<span class="nm-countdown"> (<span class="nm-om">om </span>${norCountdown.replace(/^om /, '')})</span>`;
            norRow.style.display = 'flex';
        }
    }
}

function updateNorwayBanner() { updateCountdown(); }



// ── Hjelpefunksjoner ──────────────────────────────────────────────────────────

// Buffer etter siste kamp på en dag før dagen regnes som "over".
// Kamper kan gå til ekstraomganger + straffesparkkonkurranse (~45 min ekstra),
// og openfootball-datasettet kan ha forsinkede oppdateringer.
// 3 timer (= MATCH_DUR 2t + 1t buffer) er trygt og konsistent i hele appen.
const MATCH_END_BUFFER = 3.0; // timer etter kampstart — erstatter MATCH_DUR der vi sjekker "ferdig"

// Er en enkelt kamp ferdig? (tidsbasert, uavhengig av om score finnes)
function isMatchPast(m) {
    return Date.now() > cestToDate(m.isoDate, m.t).getTime() + MATCH_END_BUFFER * 3600000;
}

// Er alle kamper på en gitt dato ferdig?
function isDayPast(isoDate) {
    const dayMatches = MATCHES.filter(m => m.isoDate === isoDate);
    if (!dayMatches.length) return isoDate < new Date().toISOString().slice(0, 10);
    const lastStart = Math.max(...dayMatches.map(m => cestToDate(m.isoDate, m.t).getTime()));
    return Date.now() > lastStart + MATCH_END_BUFFER * 3600000;
}

function tlPct(t) {
    let off = t - TL_START;
    if (off < 0) off += 24;
    return Math.max(0, Math.min(100, (off / (TL_COLS * TL_STEP)) * 100));
}
function tlW() { return (MATCH_DUR / (TL_COLS * TL_STEP)) * 100; }

function scoreStr(score) {
    if (!score) return '';
    if (score.ft) return score.ft.join('–');
    return '';
}

// Konverter CEST-desimaltimer til UTC Date for en gitt isoDate
function cestToDate(isoDate, cestT) {
    const h   = Math.floor(cestT) % 24;
    const min = Math.round((cestT % 1) * 60);
    const d   = new Date(isoDate + 'T00:00:00Z');
    if (cestT >= 24) d.setUTCDate(d.getUTCDate() + 1);
    // CEST = UTC+2
    d.setUTCHours(h - 2, min, 0, 0);
    return d;
}

// ── Dagens flagg-stripe ───────────────────────────────────────────────────────
function updateTodayStrip() {
    const strip = document.getElementById('today-strip');
    const flagsEl = document.getElementById('today-flags');
    if (!strip || !flagsEl) return;

    const todayISO = new Date().toISOString().slice(0, 10);
    const todayMatches = MATCHES.filter(m => m.isoDate === todayISO);

    if (todayMatches.length === 0) {
        strip.style.display = 'none';
        return;
    }

    strip.style.display = 'flex';
    flagsEl.innerHTML = todayMatches.map((m, i) => {
        return `<span class="today-flag-pair" onclick="openModal(MATCHES[${MATCHES.indexOf(m)}])" title="${teamName(m.team1)} vs ${teamName(m.team2)} — ${fmtT(m.t)}">
            ${m.flag1}<span class="vs-dot">·</span>${m.flag2}
        </span>`;
    }).join('');
}

// ── Live-badge (global) ───────────────────────────────────────────────────────
function checkLive() {
    const now = Date.now();
    const isLive = MATCHES.some(m => {
        if (m.t == null) return false;
        const start = cestToDate(m.isoDate, m.t).getTime();
        return now >= start && now <= start + MATCH_DUR * 3600000;
    });
    // Live-badge vises i norway-banner hvis Norge spiller, ellers skjult
    if (!MATCHES.some(m => (m.team1 === 'Norway' || m.team2 === 'Norway') &&
        (() => { const s = cestToDate(m.isoDate, m.t).getTime(); return now >= s && now <= s + MATCH_DUR * 3600000; })())) {
        const lb = document.getElementById('live-badge');
        if (lb) lb.style.display = isLive ? 'inline' : 'none';
    }
}

// ── Resolve W/L-koder i KO-kamper ────────────────────────────────────────────
function resolveKOTeams() {
    const numWinner = {};
    const numLoser  = {};

    // Bygg num→{winner,loser} fra spilte KO-kamper.
    // Matcher via score på m (som allerede har riktige lagnavn etter fetchResults
    // eller fra TEST_SCORES der nøkkelen matcher team1/team2 i MATCHES).
    // Kjør iterativt siden R16 depends on R32, QF on R16 etc.
    for (let pass = 0; pass < 6; pass++) {
        MATCHES.filter(m => m.num != null && m.type !== 'g').forEach(m => {
            if (numWinner[m.num]) return;
            // Hent score: prøv m.score (satt av fetchResults/buildMatches)
            const sc = m.score;
            if (!sc?.ft) return;
            const [g1, g2] = sc.ft;
            let w, l;
            if (g1 !== g2) {
                w = g1 > g2 ? m.team1 : m.team2;
                l = g1 > g2 ? m.team2 : m.team1;
            } else if (sc.p) {
                const [p1, p2] = sc.p;
                w = p1 > p2 ? m.team1 : m.team2;
                l = p1 > p2 ? m.team2 : m.team1;
            }
            if (w && !w.match(/^[WL]\d+$/)) { // bare løs om vinner er kjent lagnavn
                numWinner[m.num] = w;
                numLoser[m.num]  = l;
            }
        });
    }

    function resolve(code, depth) {
        if (!code || depth > 10) return code;
        const mw = code.match(/^W(\d+)$/);
        if (mw) { const n = parseInt(mw[1]); return numWinner[n] ? resolve(numWinner[n], depth+1) : code; }
        const ml = code.match(/^L(\d+)$/);
        if (ml) { const n = parseInt(ml[1]); return numLoser[n]  ? resolve(numLoser[n],  depth+1) : code; }
        return code;
    }

    MATCHES.forEach(m => {
        if (m.type === 'g') return;
        const r1 = resolve(m.team1, 0);
        const r2 = resolve(m.team2, 0);
        if (r1 !== m.team1) { m.team1 = r1; m.flag1 = TEAMS[r1]?.flag_id ? `<svg class="flag-svg" aria-hidden="true"><use href="#${TEAMS[r1].flag_id}"/></svg>` : (TEAMS[r1]?.flag || m.flag1); }
        if (r2 !== m.team2) { m.team2 = r2; m.flag2 = TEAMS[r2]?.flag_id ? `<svg class="flag-svg" aria-hidden="true"><use href="#${TEAMS[r2].flag_id}"/></svg>` : (TEAMS[r2]?.flag || m.flag2); }
    });
}

// ── Resultater fra openfootball ───────────────────────────────────────────────
async function fetchResults() {
    const status = document.getElementById('fetch-status');
    status.textContent = t('update');

    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);

    try {
        const res = await fetch(API_URL, { signal: ctrl.signal });
        clearTimeout(tid);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        // Bygg oppslag fra API-data: dato|team1|team2 → kampdata
        const apiByKey = {};
        const apiByDate = {}; // dato → [kampdata] for KO-kamper med ukjente lag
        (data.matches || []).forEach(m => {
            const key = `${m.date}|${teamName(m.team1)}|${teamName(m.team2)}`;
            apiByKey[key] = m;
            if (!apiByDate[m.date]) apiByDate[m.date] = [];
            apiByDate[m.date].push(m);
        });

        let n = 0;
        MATCHES.forEach(m => {
            // Direkte treff: lagnavn stemmer allerede
            let api = apiByKey[`${m.isoDate}|${teamName(m.team1)}|${teamName(m.team2)}`];

            // Ingen direkte treff: for KO-kamper, finn API-kamp på samme dato
            // der team1/team2 er kjente lagnavn (API har oppdatert fra "2E" til "Ecuador")
            if (!api && m.type !== 'g') {
                const candidates = (apiByDate[m.isoDate] || []).filter(a =>
                    a.score &&
                    // Lagnavn — ikke posisjonskode
                    !a.team1.match(/^[123][A-L]/) && !a.team1.match(/^[WL]\d/) &&
                    // Ikke allerede matchet av en annen kamp
                    !MATCHES.some(o => o !== m && o.isoDate === m.isoDate && o.team1 === a.team1 && o.team2 === a.team2)
                );
                if (candidates.length === 1) api = candidates[0];
            }

            if (api) {
                // Oppdater teamnavn og flagg hvis API har lagnavn vi ikke hadde
                if (api.team1 && api.team1 !== m.team1 && !api.team1.match(/^[123WL]/)) {
                    m.team1 = api.team1;
                    m.flag1 = TEAMS[api.team1]?.flag_id ? `<svg class="flag-svg" aria-hidden="true"><use href="#${TEAMS[api.team1].flag_id}"/></svg>` : (TEAMS[api.team1]?.flag || m.flag1);
                }
                if (api.team2 && api.team2 !== m.team2 && !api.team2.match(/^[123WL]/)) {
                    m.team2 = api.team2;
                    m.flag2 = TEAMS[api.team2]?.flag_id ? `<svg class="flag-svg" aria-hidden="true"><use href="#${TEAMS[api.team2].flag_id}"/></svg>` : (TEAMS[api.team2]?.flag || m.flag2);
                }
                if (api.score) { m.score = api.score; n++; }
            }
        });

        // Etter at scores er satt: resolve W/L-koder til faktiske lagnavn
        // Openfootball bruker lagnavn direkte ("Spain", "Argentina") i sine data,
        // og våre MATCHES har W{num} for fremtidige KO-kamper.
        // Når vi vet hvem som vant #99, oppdaterer vi team1/team2 i #100 etc.
        resolveKOTeams();

        const now = new Date().toLocaleTimeString('no', { hour:'2-digit', minute:'2-digit' });
        status.textContent = n > 0 ? `${n} ${t('results')} — ${now}` : `${t('updated_at')} ${now}`;

        buildTimeline();
        buildTable();
        buildGroups();
        updateNorwayBanner();
        buildNorwaySchedule();
        updateHeaderHeight();
        NORWAY_POTENTIAL_MATCHES = new Set(getNorwayPotentialMatches().map(m => m.num));
        if (document.getElementById('vg')?.dataset.built) buildVerticalGrid();

    } catch (err) {
        clearTimeout(tid);
        status.textContent = err.name === 'AbortError' ? t('timeout') : '';
        console.warn('fetchResults:', err.message);
    }
}

// ── KO-bane-resolver ─────────────────────────────────────────────────────────
// Gitt en posisjonskode (f.eks. "W89", "1E", "3A/B/C/D/F"), løs den rekursivt
// til en liste med { code, label } som representerer mulige lag/veier.
function resolveSlotToTeams(code, depth) {
    if (depth === undefined) depth = 0;
    if (depth > 4) return { type: 'leaf', label: code };

    // W<num> — vinneren av kamp num
    const wMatch = code.match(/^W(\d+)$/);
    if (wMatch) {
        const num = parseInt(wMatch[1], 10);
        const raw = MATCHES_RAW.find(m => m.num === num);
        if (!raw) return { type: 'leaf', label: code };
        // Hvis kamp er spilt og vi har et kjent lagnavn — returner direkte
        const live = MATCHES.find(m => m.num === num);
        if (live?.score?.ft) {
            // Resolved: vinneren er et faktisk lag
            const winnerName = live.score.ft[0] > live.score.ft[1] ? live.team1 :
                               live.score.ft[1] > live.score.ft[0] ? live.team2 :
                               live.score.p ? (live.score.p[0] > live.score.p[1] ? live.team1 : live.team2) : null;
            if (winnerName && !isUnresolvedCode(winnerName))
                return { type: 'leaf', label: winnerName };
        }
        const t1 = resolveSlotToTeams(raw.team1, depth + 1);
        const t2 = resolveSlotToTeams(raw.team2, depth + 1);
        return { type: 'match', num, left: t1, right: t2 };
    }

    // L<num> — taperen av kamp num
    const lMatch = code.match(/^L(\d+)$/);
    if (lMatch) {
        const num = parseInt(lMatch[1], 10);
        const raw = MATCHES_RAW.find(m => m.num === num);
        if (!raw) return { type: 'leaf', label: code };
        const t1 = resolveSlotToTeams(raw.team1, depth + 1);
        const t2 = resolveSlotToTeams(raw.team2, depth + 1);
        return { type: 'match', num, loser: true, left: t1, right: t2 };
    }

    // Gruppeposisjon eller beste-treer — leaf-node
    return { type: 'leaf', label: code };
}

// Render et resolve-tre som HTML
function renderSlotTree(node) {
    if (!node) return '';
    if (node.type === 'leaf') {
        // Vis kjente lagnavn med flagg
        const td = TEAMS[node.label];
        if (td) {
            const flag = td.flag_id
                ? `<svg class="flag-svg" aria-hidden="true" style="height:.9em;width:1.2em;vertical-align:middle;margin-right:.25em"><use href="#${td.flag_id}"/></svg>`
                : (td.flag || '');
            return `<li class="modal-ko-leaf modal-ko-team">${flag}${teamName(node.label)}</li>`;
        }
        return `<li class="modal-ko-leaf">${node.label}</li>`;
    }
    if (node.type === 'match') {
        const roundLabel = (() => {
            const m = MATCHES.find(x => x.num === node.num);
            if (!m) return `#${node.num}`;
            const labels = { r32: t('grp_r32'), r16: t('grp_r16'), qf: t('grp_qf'), sf: t('grp_sf') };
            return labels[m.type] || `#${node.num}`;
        })();
        const prefix = node.loser ? t('ko_loser_of') : t('ko_winner_of');
        const leftHtml  = renderSlotTree(node.left);
        const rightHtml = renderSlotTree(node.right);
        return `<li class="modal-ko-group">
            <span class="modal-ko-group-label">${prefix} ${roundLabel}:</span>
            <ul class="modal-ko-slot-list modal-ko-slot-sublist">
                ${leftHtml}
                ${rightHtml}
            </ul>
        </li>`;
    }
    return '';
}

// Sjekk om en kode er et ekte lagnavn (ikke en posisjonskode)
function isUnresolvedCode(code) {
    return /^[WL]\d+$/.test(code) || /^\d[A-L]$/.test(code) || /^3[A-L\/]+$/.test(code);
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function openModal(m) {
    const sc = m.score;
    const st = STADIUMS[m.v] || {};

    let scoreHtml = '';
    if (sc && sc.ft) {
        scoreHtml = `<div class="modal-score">${sc.ft[0]} – ${sc.ft[1]}</div>`;
        const extra = [];
        if (sc.et) extra.push(`${t('et')} ${sc.et[0]}–${sc.et[1]}`);
        if (sc.p)  extra.push(`${t('pen')} ${sc.p[0]}–${sc.p[1]}`);
        if (extra.length) scoreHtml += `<div class="modal-goals">${extra.join(' · ')}</div>`;

        const fmtGoals = (goals) => (goals||[]).map(g => {
            const pen = g.penalty ? ` (${t('pen')})` : '';
            const own = g.owngoal ? ` (${t('own_goal')})` : '';
            const off = g.offset  ? `+${g.offset}` : '';
            return `${g.name} ${g.minute}${off}'${pen}${own}`;
        }).join('<br>');

        const g1 = fmtGoals(m.score.goals1);
        const g2 = fmtGoals(m.score.goals2);
        if (g1 || g2) {
            scoreHtml += `<div class="modal-goals" style="text-align:left;display:grid;grid-template-columns:1fr 1fr;gap:.5rem;margin-top:.5rem">
                <div>${g1}</div><div style="text-align:right">${g2}</div>
            </div>`;
        }
    } else {
        // Ingen score ennå — vis kun tid og dato (ikke dobbelt)
        scoreHtml = `<div class="modal-score no-score">${t('not_played')}</div>`;
    }

    const grpLabel = m.grp.length === 1 ? `${t('grp_prefix')}${m.grp}` :
        ({ R32: t('grp_r32'), R16: t('grp_r16'), QF: t('grp_qf'), SF: t('grp_sf'), '3P': t('grp_3p'), FIN: t('grp_fin') })[m.grp] || m.grp;

    // Vis kampnummer i modal for sluttspillkamper der neste runde refererer W{num}
    const numRef = m.num != null && m.type !== 'g' &&
        MATCHES.some(x => x.num != null && !x.score?.ft &&
            (x.team1 === `W${m.num}` || x.team2 === `W${m.num}` ||
             x.team1 === `L${m.num}` || x.team2 === `L${m.num}`))
        ? m.num : null;

    // Beregn lokal tid fra CEST (UTC+2) og stadionets UTC-offset
    function localTime(cestT, tzStr) {
        if (!tzStr) return null;
        const m = tzStr.match(/UTC([+-]\d+)/);
        if (!m) return null;
        const offset = parseInt(m[1]);
        // CEST = UTC+2, lokal = UTC+offset
        let localH = Math.floor(cestT) % 24 + (offset - 2);
        const localMin = Math.round((cestT % 1) * 60);
        localH = ((localH % 24) + 24) % 24;
        const tzName = { '-7':'PDT', '-6':'MDT/CST', '-5':'CDT', '-4':'EDT' }[String(offset)] || tzStr;
        return `${String(localH).padStart(2,'0')}:${String(localMin).padStart(2,'0')} ${tzName}`;
    }
    const localT = localTime(m.t, st.tz);

    document.getElementById('modal-content').innerHTML = `
        <div class="modal-grp">${grpLabel}${numRef ? `<span class="modal-match-num"> · ${t('match_num')}${numRef}</span>` : ''}</div>
        <div class="modal-teams">
            <div class="modal-team">
                <span class="modal-flag">${m.flag1}</span>
                <span class="modal-name">${teamName(m.team1)}</span>
            </div>
            <span class="modal-vs">–</span>
            <div class="modal-team">
                <span class="modal-flag">${m.flag2}</span>
                <span class="modal-name">${teamName(m.team2)}</span>
            </div>
        </div>
        ${scoreHtml}
        <div class="modal-meta">
            <div class="modal-meta-row">
                <i class="bi bi-clock"></i>
                <span class="modal-time-block">
                    <span class="modal-time-big">${fmtT(toLocalT(m.t))} ${currentTZ().label}${nextDayBadge(m.t, m.isoDate)}${localT ? ` · ${localT}` : ''}</span>
                    <span class="modal-time-sub">${m.day} ${m.date}</span>
                </span>
                ${m.tv ? `<span class="modal-tv modal-tv-${m.tv.toLowerCase().replace(/\s/g,'-')}">${m.tv}</span>` : ''}
            </div>
            <div class="modal-meta-row"><i class="bi bi-geo-alt"></i><span>${st.name || m.ground}</span></div>
            <div class="modal-meta-row"><i class="bi bi-people"></i><span>${st.cap ? st.cap.toLocaleString('no') + ` ${t('seats')}` : m.ground}</span></div>
            <div class="modal-meta-row"><i class="bi bi-pin-map"></i><span>${st.city || m.ground}${st.country ? ', ' + st.country : ''}</span></div>
            ${st.region ? `<div class="modal-meta-row"><i class="bi bi-globe-americas"></i><span>${st.region} ${t('region')}</span></div>` : ''}
        </div>
        <div class="modal-share">
            <button class="modal-share-btn" onclick="closeModal();openVenueModal('${m.v}')">
                <i class="bi bi-building"></i> ${t('arena_btn')}
            </button>
            ${!m.team1.match(/^[WL]\d|^\d/) ? `<button class="modal-share-btn" onclick="closeModal();openTeamModal('${m.team1.replace(/'/g, "\\'")}')">
                ${m.flag1}
            </button>` : ''}
            ${!m.team2.match(/^[WL]\d|^\d/) ? `<button class="modal-share-btn" onclick="closeModal();openTeamModal('${m.team2.replace(/'/g, "\\'")}')">
                ${m.flag2}
            </button>` : ''}
            <button id="share-btn" class="modal-share-btn" onclick="shareMatch(_modalMatch)">
                <i class="bi bi-share"></i>
            </button>
        </div>
        ${(() => {
            if (m.type === 'g') return '';
            // Bruk MATCHES_RAW for å sjekke opprinnelige koder — resolveKOTeams
            // kan ha overskrevet team1/team2 i MATCHES med ekte lagnavn
            const rawM = m.num != null ? MATCHES_RAW.find(r => r.num === m.num) : null;
            const rawT1 = rawM ? rawM.team1 : m.team1;
            const rawT2 = rawM ? rawM.team2 : m.team2;
            const t1unresolved = isUnresolvedCode(rawT1);
            const t2unresolved = isUnresolvedCode(rawT2);
            if (!t1unresolved && !t2unresolved) return '';

            function slotHtml(rawCode, resolvedName) {
                const tree = resolveSlotToTeams(rawCode);
                const isLoser = /^L\d+$/.test(rawCode);
                const prefix  = isLoser ? t('ko_loser_of') : t('ko_winner_of');
                // Hvis allerede løst til kjent lagnavn — vis ikke seksjonen
                if (tree.type === 'leaf' && !isUnresolvedCode(tree.label)) return '';
                if (tree.type === 'leaf') {
                    // Enkel leaf med posisjonskode
                    return `<div class="modal-ko-slot">
                        <div class="modal-ko-slot-label">${prefix}</div>
                        <ul class="modal-ko-slot-list"><li class="modal-ko-leaf">${tree.label}</li></ul>
                    </div>`;
                }
                return `<div class="modal-ko-slot">
                    <div class="modal-ko-slot-label">${prefix}</div>
                    <ul class="modal-ko-slot-list">
                        ${renderSlotTree(tree.left)}
                        ${renderSlotTree(tree.right)}
                    </ul>
                </div>`;
            }

            const slots = [
                t1unresolved ? slotHtml(rawT1, m.team1) : '',
                t2unresolved ? slotHtml(rawT2, m.team2) : '',
            ].filter(Boolean).join('');
            if (!slots) return '';

            return `<div class="modal-ko-paths${(t1unresolved && t2unresolved) ? ' modal-ko-paths-two' : ''}">
                <div class="modal-ko-paths-title">${t('ko_paths_title')}</div>
                ${slots}
            </div>`;
        })()}
    `;
    document.getElementById('modal').style.display = 'flex';
    window._modalMatch = m; // brukes av shareMatch-knappen
    // Legg til norway-match-klasse hvis det er en Norge-kamp
    const modalEl = document.querySelector('.modal');
    if (modalEl) {
        const isNorwayMatch = m.team1 === 'Norway' || m.team2 === 'Norway';
        modalEl.classList.toggle('norway-match', isNorwayMatch);
    }
    // Oppdater hash i URL
    const hash = m.num ? `#kamp-${m.num}` : `#${m.isoDate}-${m.team1.replace(/\s/g,'-')}-${m.team2.replace(/\s/g,'-')}`;
    history.replaceState(null, '', hash);
    document.addEventListener('keydown', onModalKey);
}

function closeModal(e) {
    if (e && e.target !== document.getElementById('modal')) return;
    document.getElementById('modal').style.display = 'none';
    document.removeEventListener('keydown', onModalKey);
    history.replaceState(null, '', location.pathname);
}

function onModalKey(e) {
    if (e.key === 'Escape') {
        document.getElementById('modal').style.display = 'none';
        document.removeEventListener('keydown', onModalKey);
    }
}

// ── Deling via URL/hash ───────────────────────────────────────────────────────
function shareMatch(m) {
    const hash = m.num ? `#kamp-${m.num}` : `#${m.isoDate}-${m.team1.replace(/\s/g,'-')}-${m.team2.replace(/\s/g,'-')}`;
    // Bruk pre-generert kamp-side for rike embeds
    const slug = m.num
        ? String(m.num)
        : `${m.isoDate}-${m.team1.replace(/[^a-zA-Z0-9]/g,'-')}-${m.team2.replace(/[^a-zA-Z0-9]/g,'-')}`;
    const url = `${location.origin}/kamp/${slug}.html`;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => {
            const btn = document.getElementById('share-btn');
            if (btn) { btn.innerHTML = '<i class="bi bi-check"></i>'; setTimeout(() => { btn.innerHTML = '<i class="bi bi-share"></i>'; }, 2000); }
        });
    } else {
        prompt('Kopier lenken:', url);
    }
    history.replaceState(null, '', hash);
}

// ── Del hele siden ────────────────────────────────────────────────────────────
// ── Del hele siden ────────────────────────────────────────────────────────────
// Bygger en del-URL med gjeldende hash og tz. Bruker /en/ som base for engelsk.
function buildShareURL() {
    const base   = LANG === 'en' ? location.origin + '/en/' : location.origin + '/';
    const params = new URLSearchParams();
    params.set('tz', currentTZ().label);
    if (LANG !== 'en') params.set('lang', LANG);
    return base + '?' + params.toString() + location.hash;
}

function shareApp() {
    const url   = buildShareURL();
    const title = t('share_page');
    const text  = t('share_text');
    const btn   = document.querySelector('.header-share-btn');

    function flash() {
        if (!btn) return;
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="bi bi-check"></i>';
        setTimeout(() => { btn.innerHTML = orig; }, 2000);
    }

    if (navigator.share) {
        navigator.share({ title, text, url }).catch(() => {});
    } else if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(flash);
    } else {
        prompt(t('copy_link'), url);
    }
}

function openModalByHash() {
    const hash = location.hash;
    if (!hash) return;

    // Fane-navigasjon — norske og engelske hash-navn
    const tabMap = {
        '#tidslinje': 'timeline', '#tab-timeline': 'timeline', '#timeline': 'timeline',
        '#rutenett':  'grid',     '#tab-grid':     'grid',     '#grid':     'grid',
        '#kamper':    'table',    '#tab-table':    'table',    '#table':    'table',
        '#grupper':   'groups',   '#tab-groups':   'groups',   '#groups':   'groups',
        '#arenaer':   'arenas',   '#tab-arenas':   'arenas',   '#venues':   'arenas',
        '#arena':     'arenas',
        '#statistikk':'stats',    '#tab-stats':    'stats',    '#stats':    'stats',
        '#sluttspill':'bracket',  '#tab-bracket':  'bracket',  '#bracket':  'bracket',
    };
    if (tabMap[hash]) {
        let tabName = tabMap[hash];
        // grid/rutenett → åpne timeline-fanen (modus velges av enheten, ikke URL)
        if (tabName === 'grid') tabName = 'timeline';
        const btn = document.querySelector(`.tab[onclick*="showTab('${tabName}'"]`);
        if (btn) {
            showTab(tabName, btn);
        } else {
            ['timeline','table','groups','bracket','stats','arenas'].forEach(n => {
                const el = document.getElementById('view-'+n);
                if (el) el.classList.toggle('active', n === tabName);
            });
            if (tabName === 'stats' && !document.getElementById('stats-built')) buildStats();
        }
        return;
    }

    // Arena-modal: #arena-NY, #arena-BO etc.
    const arenaMatch = hash.match(/^#arena-([A-Z]{2})$/);
    if (arenaMatch) {
        const btn = document.querySelector(`.tab[onclick*="showTab('arenas'"]`);
        if (btn) showTab('arenas', btn);
        setTimeout(() => openVenueModal(arenaMatch[1]), 100);
        return;
    }

    // Kampmodal (eksisterende logikk)
    let match = null;
    const numMatch = hash.match(/^#kamp-(\d+)$/);
    if (numMatch) {
        match = MATCHES.find(m => m.num === parseInt(numMatch[1]));
    } else {
        // Format: #2026-06-11-Team1-Team2 (dato er alltid YYYY-MM-DD = 10 tegn)
        const raw = hash.slice(1); // fjern #
        if (raw.length > 10 && raw[4] === '-' && raw[7] === '-') {
            const iso = raw.slice(0, 10);
            const rest = raw.slice(11); // alt etter datoen og bindestrek
            // Prøv å matche team1 og team2 fra resten
            match = MATCHES.find(m => {
                if (m.isoDate !== iso) return false;
                const t1 = m.team1.replace(/\s/g, '-');
                const t2 = m.team2.replace(/\s/g, '-');
                return rest === `${t1}-${t2}`;
            });
            // Fallback: bare dato (første kamp den dagen)
            if (!match) match = MATCHES.find(m => m.isoDate === iso);
        }
    }
    if (match) openModal(match);
}

// Hjelpefunksjoner for vertland (USA, Canada, Mexico)

// Returnerer +1-badge HTML om kampen starter etter lokal midnatt
function nextDayBadge(matchT, isoDate) {
    if (!matchT || toLocalT(matchT) < 24) return '';
    const nextDay = new Date(isoDate + 'T12:00:00');
    nextDay.setDate(nextDay.getDate() + 1);
    const days = t('days');
    const mo   = t('months');
    const label = `${t('night_to')} ${days[nextDay.getDay()]} ${nextDay.getDate()}. ${mo[nextDay.getMonth()]}`;
    return `<sup class="next-day-badge" title="${label}" aria-label="${label}">+1</sup>`;
}

function hostCountryFlag(country) {
    const ids = { 'USA': 'us', 'Canada': 'ca', 'Mexico': 'mx' };
    const id = ids[country];
    return id ? `<svg class="flag-svg" aria-hidden="true"><use href="#${id}"/></svg>` : '';
}

// ── Stadion-modal ─────────────────────────────────────────────────────────────
function openVenueModal(code) {
    const st = STADIUMS[code];
    if (!st) return;
    const flag = hostCountryFlag(st.country);

    // Beregn UTC-offset fra tz-streng (f.eks. "UTC-7" → -7)
    function getOffset(tzStr) {
        const m = tzStr?.match(/UTC([+-]\d+)/);
        return m ? parseInt(m[1]) : null;
    }
    function localTimeStr(cestT, offset) {
        if (offset === null) return null;
        let h = Math.floor(cestT) % 24 + (offset - 2);
        const min = Math.round((cestT % 1) * 60);
        h = ((h % 24) + 24) % 24;
        const tzName = { '-7':'PDT', '-6':'MDT', '-5':'CDT', '-4':'EDT' }[String(offset)] || `UTC${offset}`;
        return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')} ${tzName}`;
    }
    const offset = getOffset(st.tz);

    const matches = MATCHES.filter(m => m.v === code);
    const matchRows = matches.map(m => {
        const sc = scoreStr(m.score);
        const isNorway = m.team1 === 'Norway' || m.team2 === 'Norway';
        const localT = localTimeStr(m.t, offset);
        return `<div class="venue-match${isNorway ? ' venue-match-norway' : ''}" onclick="closeModal();openModal(MATCHES[${MATCHES.indexOf(m)}])">
            <span class="venue-match-date">${m.day} ${m.date}</span>
            <span class="venue-match-teams">${m.flag1} ${teamName(m.team1)} v ${teamName(m.team2)} ${m.flag2}</span>
            <span class="venue-match-time">
                <span class="venue-match-cest">${fmtT(m.t)}${nextDayBadge(m.t, m.isoDate)}</span>
                ${localT ? `<span class="venue-match-local">${localT}</span>` : ''}
            </span>
            <span class="venue-match-score">${sc || ''}</span>
        </div>`;
    }).join('');

    document.getElementById('modal-content').innerHTML = `
        <div class="modal-grp">${st.region || ''} Region · ${st.tz || ''}</div>
        <div class="venue-header">
            <div class="venue-name">${st.name}</div>
            <div class="venue-city">${flag} ${st.city}${st.country ? ', ' + st.country : ''}</div>
        </div>
        <div class="modal-meta" style="margin-bottom:.75rem">
            <div class="modal-meta-row"><i class="bi bi-people"></i><span>${st.cap ? st.cap.toLocaleString('no') + ` ${t('seats')}` : ''}</span></div>
        </div>
        <div class="venue-matches-title">${t('venue_matches')} (${matches.length})</div>
        <div class="venue-matches">${matchRows}</div>
    `;
    document.getElementById('modal').style.display = 'flex';
    document.querySelector('.modal')?.classList.remove('norway-match');
    history.replaceState(null, '', `#arena-${code}`);
    document.addEventListener('keydown', onModalKey);
}

// ── Gruppe-modal ──────────────────────────────────────────────────────────────
function openGroupModal(grp) {
    const matches = MATCHES.filter(m => m.grp === grp && m.type === 'g')
        .sort((a, b) => a.isoDate < b.isoDate ? -1 : a.isoDate > b.isoDate ? 1 : a.t - b.t);
    if (!matches.length) return;

    const matchRows = matches.map(m => {
        const sc = scoreStr(m.score);
        const isNorway = m.team1 === 'Norway' || m.team2 === 'Norway';
        return `<div class="venue-match${isNorway ? ' venue-match-norway' : ''}" onclick="closeModal();openModal(MATCHES[${MATCHES.indexOf(m)}])">
            <span class="venue-match-date">${m.day} ${m.date}</span>
            <span class="venue-match-teams">${m.flag1} ${teamName(m.team1)} v ${teamName(m.team2)} ${m.flag2}</span>
            <span class="venue-match-time">
                <span class="venue-match-cest">${fmtT(m.t)}${nextDayBadge(m.t, m.isoDate)}</span>
            </span>
            <span class="venue-match-score">${sc || ''}</span>
        </div>`;
    }).join('');

    document.getElementById('modal-content').innerHTML = `
        <div class="modal-grp">${t('grp_prefix')}${grp}</div>
        <div class="venue-matches-title">${t('venue_matches')} (${matches.length})</div>
        <div class="venue-matches">${matchRows}</div>
        <div class="modal-share">
            <button class="modal-share-btn" onclick="setGroupFilter('${grp}'); showTab('timeline', document.querySelector('.tab')); closeModal();">
                <i class="bi bi-funnel"></i> ${t('show_tl')}
            </button>
        </div>
    `;
    document.getElementById('modal').style.display = 'flex';
    document.querySelector('.modal')?.classList.remove('norway-match');
    document.addEventListener('keydown', onModalKey);
}

// ── Lag-modal ─────────────────────────────────────────────────────────────────
function openTeamModal(teamKey) {
    const teamData = TEAMS[teamKey];
    if (!teamData) return;
    const isFav = FAVORITE_TEAMS.includes(teamKey);
    const teamMatches = MATCHES.filter(m => m.team1 === teamKey || m.team2 === teamKey);

    // Bygg kamp-rader med hviledag-gap mellom kamper
    let matchRows = '';
    for (let i = 0; i < teamMatches.length; i++) {
        if (i > 0) {
            const prev = teamMatches[i - 1];
            const curr = teamMatches[i];
            const prevDate = new Date(prev.isoDate + 'T12:00:00');
            const currDate = new Date(curr.isoDate + 'T12:00:00');
            const diffDays = Math.round((currDate - prevDate) / 86400000);
            if (diffDays > 1) {
                matchRows += `<div class="team-match-gap">${t('rest_days', diffDays - 1)}</div>`;
            }
        }
        const m = teamMatches[i];
        const sc = scoreStr(m.score);
        const isNorway = m.team1 === 'Norway' || m.team2 === 'Norway';
        matchRows += `<div class="venue-match${isNorway ? ' venue-match-norway' : ''}" onclick="closeModal();openModal(MATCHES[${MATCHES.indexOf(m)}])">
            <span class="venue-match-date">${m.day} ${m.date}</span>
            <span class="venue-match-teams">${m.flag1} ${teamName(m.team1)} v ${teamName(m.team2)} ${m.flag2}</span>
            <span class="venue-match-time">
                <span class="venue-match-cest">${fmtT(m.t)}${nextDayBadge(m.t, m.isoDate)}</span>
            </span>
            <span class="venue-match-score">${sc || ''}</span>
        </div>`;
    }

    const grpLabel = teamData.group ? `${t('grp_prefix')}${teamData.group}` : '';
    const confLabel = teamData.confederation || '';

    document.getElementById('modal-content').innerHTML = `
        <div class="modal-grp">${grpLabel}${grpLabel && confLabel ? ' · ' : ''}${confLabel}</div>
        <div class="team-header">
            <div class="team-flag-lg">${teamData.flag_id ? `<svg class="flag-svg" style="width:2.5rem;height:1.875rem" aria-hidden="true"><use href="#${teamData.flag_id}"/></svg>` : (teamData.flag || '')}</div>
            <div class="team-info">
                <div class="team-name-lg">${teamName(teamKey)}</div>
                <div class="team-meta">${grpLabel}${grpLabel && confLabel ? ' · ' : ''}${confLabel}</div>
            </div>
        </div>
        <div class="venue-matches-title">${t('venue_matches')} (${teamMatches.length})</div>
        <div class="venue-matches">${matchRows}</div>
        <div class="modal-share">
            <button class="modal-share-btn fav-btn ${isFav ? 'fav-active' : ''}" onclick="toggleFavorite('${teamKey}')">
                <i class="bi bi-heart${isFav ? '-fill' : ''}"></i> ${isFav ? t('fav_active') : t('add_fav')}
            </button>
            <button class="modal-share-btn" onclick="setTeamFilter('${teamKey}'); showTab('timeline', document.querySelector('.tab')); closeModal();">
                <i class="bi bi-funnel"></i> ${t('show_tl')}
            </button>
        </div>
    `;
    document.getElementById('modal').style.display = 'flex';
    document.querySelector('.modal')?.classList.remove('norway-match');
    if (teamKey === 'Norway') {
        document.querySelector('.modal')?.classList.add('norway-match');
    }
    document.addEventListener('keydown', onModalKey);
}

// ── Favoritter ────────────────────────────────────────────────────────────────
function toggleFavorite(teamName) {
    const idx = FAVORITE_TEAMS.indexOf(teamName);
    if (idx >= 0) FAVORITE_TEAMS.splice(idx, 1);
    else FAVORITE_TEAMS.push(teamName);
    saveFavorites();
    // Re-render modal med oppdatert state
    openTeamModal(teamName);
    // Re-render tidslinje og tabell for å oppdatere highlights
    buildTimeline();
    buildTable();
    buildGroups();
}

// ── Filter ────────────────────────────────────────────────────────────────────
function setTeamFilter(teamName) {
    ACTIVE_FILTER = { type: 'team', value: teamName };
    buildTimeline();
    buildTable();
    buildBracket();
    renderFilterPill();
}

function setGroupFilter(grp) {
    ACTIVE_FILTER = { type: 'group', value: grp };
    buildTimeline();
    buildTable();
    buildBracket();
    renderFilterPill();
}

function setFavoritesFilter() {
    ACTIVE_FILTER = { type: 'favorites' };
    buildTimeline();
    buildTable();
    buildBracket();
    renderFilterPill();
}

function clearFilter() {
    ACTIVE_FILTER = null;
    buildTimeline();
    buildTable();
    buildBracket();
    renderFilterPill();
}

function toggleHighlights() {
    HIGHLIGHTS_ON = !HIGHLIGHTS_ON;
    saveHighlights();
    buildTimeline();
    buildTable();
    buildGroups();
    buildBracket();
    renderTlToolbar();
    renderBracketToolbar();
    if (document.getElementById('vg')?.dataset.built) buildVerticalGrid();
}

function renderTlToolbar() {
    let bar = document.getElementById('tl-toolbar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'tl-toolbar';
        bar.className = 'tl-toolbar';
        const hint = document.getElementById('tl-hint');
        hint.after(bar);
    }

    // Update scroll hint text
    const hintText = document.getElementById('tl-hint-text');
    if (hintText) hintText.textContent = t('scroll_hint');

    // Grupper A–L
    const groups = 'ABCDEFGHIJKL'.split('');
    // Alle lag sortert etter gruppe
    const teams = Object.entries(TEAMS)
        .filter(([, td]) => !td._alias && td.group);

    // Sortering: Norge øverst → favoritter → alfabetisk
    const favTeams = teams
        .filter(([name]) => name !== 'Norway' && FAVORITE_TEAMS.includes(name))
        .sort((a, b) => a[0].localeCompare(b[0]));
    const otherTeams = teams
        .filter(([name]) => name !== 'Norway' && !FAVORITE_TEAMS.includes(name))
        .sort((a, b) => a[0].localeCompare(b[0]));

    const activeGrp = ACTIVE_FILTER?.type === 'group' ? ACTIVE_FILTER.value : null;
    const activeTeam = ACTIVE_FILTER?.type === 'team' ? ACTIVE_FILTER.value : null;

    bar.innerHTML = `
        <div class="tl-toolbar-left">
            <div class="tl-filter-wrap">
                <button class="tl-filter-btn${ACTIVE_FILTER ? ' active' : ''}" onclick="toggleTlFilterMenu()" id="tl-filter-toggle" aria-expanded="false">
                    <i class="bi bi-funnel"></i>
                    <span>${ACTIVE_FILTER
                        ? (ACTIVE_FILTER.type === 'team'
                            ? `${TEAMS[ACTIVE_FILTER.value]?.flag_id ? `<svg class="flag-svg" aria-hidden="true"><use href="#${TEAMS[ACTIVE_FILTER.value].flag_id}"/></svg>` : (TEAMS[ACTIVE_FILTER.value]?.flag || '')} ${ACTIVE_FILTER.value}`
                            : ACTIVE_FILTER.type === 'favorites'
                            ? `<i class="bi bi-heart-fill" style="margin-right:.3em"></i>${t('favourites')}`
                            : `${t('grp_prefix')}${ACTIVE_FILTER.value}`)
                        : t('filter')}</span>
                </button>
                <div class="tl-filter-menu" id="tl-filter-menu" style="display:none">
                    <div class="tl-filter-section">Grupper</div>
                    <div class="tl-filter-groups">
                        ${groups.map(g => `<button class="tl-filter-grp${activeGrp === g ? ' selected' : ''}" onclick="setGroupFilter('${g}');closeTlFilterMenu()">Gr. ${g}</button>`).join('')}
                    </div>
                    <div class="tl-filter-section">Lag</div>
                    <div class="tl-filter-teams">
                        <button class="tl-filter-team${activeTeam === 'Norway' ? ' selected' : ''}" onclick="setTeamFilter('Norway');closeTlFilterMenu()">${TEAMS['Norway']?.flag_id ? `<svg class="flag-svg" aria-hidden="true"><use href="#${TEAMS['Norway'].flag_id}"/></svg>` : '🇳🇴'} Norway</button>
                        ${favTeams.length > 0 ? `
                        <div class="tl-filter-divider"></div>
                        ${FAVORITE_TEAMS.filter(n => n !== 'Norway').length > 0 ? `<button class="tl-filter-team tl-filter-favorites${ACTIVE_FILTER?.type === 'favorites' ? ' selected' : ''}" onclick="setFavoritesFilter();closeTlFilterMenu()"><i class="bi bi-heart-fill"></i> ${t('fav_count', FAVORITE_TEAMS.filter(n => n !== 'Norway').length)}</button>` : ''}
                        ${favTeams.map(([name, td]) => `<button class="tl-filter-team${activeTeam === name ? ' selected' : ''}" onclick="setTeamFilter('${name}');closeTlFilterMenu()">${td.flag_id ? `<svg class="flag-svg" aria-hidden="true"><use href="#${td.flag_id}"/></svg>` : (td.flag || '')} ${teamName(name)}</button>`).join('')}` : ''}
                        <div class="tl-filter-divider"></div>
                        ${otherTeams.map(([name, td]) => `<button class="tl-filter-team${activeTeam === name ? ' selected' : ''}" onclick="setTeamFilter('${name}');closeTlFilterMenu()">${td.flag_id ? `<svg class="flag-svg" aria-hidden="true"><use href="#${td.flag_id}"/></svg>` : (td.flag || '')} ${teamName(name)}</button>`).join('')}
                    </div>
                </div>
            </div>
            ${ACTIVE_FILTER ? `<button class="tl-filter-clear-btn" onclick="clearFilter()" aria-label="Fjern filter"><i class="bi bi-x"></i> ${t('reset')}</button>` : ''}
        </div>
        <div class="tl-toolbar-right">
            <button class="tl-highlight-toggle${TL_MODE === 'vertical' ? ' on' : ''}" onclick="toggleTlMode()" title="${TL_MODE === 'vertical' ? t('tab_timeline') : t('tab_grid')}">
                ${TRANSPOSE_SVG}
            </button>
            <button class="tl-highlight-toggle${!TL_COMPACT ? ' on' : ''}" onclick="toggleTlCompact()" title="${!TL_COMPACT ? t('compact') : t('expanded_v')}">
                <i class="bi bi-layout-text-sidebar-reverse"></i>
            </button>
            <button class="tl-highlight-toggle${HIGHLIGHTS_ON ? ' on' : ''}" onclick="toggleHighlights()" title="${HIGHLIGHTS_ON ? t('hide_hl') : t('show_hl')}">
                <i class="bi bi-heart${HIGHLIGHTS_ON ? '-fill' : ''}"></i>
            </button>
        </div>
    `;
}

function toggleTlExpanded() {
    toggleTlCompact();
}

function renderTblToolbar() {
    const bar = document.getElementById('tbl-toolbar');
    if (!bar) return;
    // Gjenbruk samme struktur som tidslinje-toolbar, men med annen menu-ID
    const activeGrp  = ACTIVE_FILTER?.type === 'group' ? ACTIVE_FILTER.value : null;
    const activeTeam = ACTIVE_FILTER?.type === 'team'  ? ACTIVE_FILTER.value : null;
    const groups = 'ABCDEFGHIJKL'.split('');
    const favTeams2 = Object.entries(TEAMS)
        .filter(([name, td]) => !td._alias && td.group && name !== 'Norway' && FAVORITE_TEAMS.includes(name))
        .sort((a, b) => a[0].localeCompare(b[0]));
    const otherTeams2 = Object.entries(TEAMS)
        .filter(([name, td]) => !td._alias && td.group && name !== 'Norway' && !FAVORITE_TEAMS.includes(name))
        .sort((a, b) => a[0].localeCompare(b[0]));

    bar.className = 'tl-toolbar';
    bar.innerHTML = `
        <div class="tl-toolbar-left">
            <div class="tl-filter-wrap">
                <button class="tl-filter-btn${ACTIVE_FILTER ? ' active' : ''}" onclick="toggleTblFilterMenu()" id="tbl-filter-toggle" aria-expanded="false">
                    <i class="bi bi-funnel"></i>
                    <span>${ACTIVE_FILTER
                        ? (ACTIVE_FILTER.type === 'team'
                            ? `${TEAMS[ACTIVE_FILTER.value]?.flag_id ? `<svg class="flag-svg" aria-hidden="true"><use href="#${TEAMS[ACTIVE_FILTER.value].flag_id}"/></svg>` : (TEAMS[ACTIVE_FILTER.value]?.flag || '')} ${ACTIVE_FILTER.value}`
                            : ACTIVE_FILTER.type === 'favorites'
                            ? `<i class="bi bi-heart-fill" style="margin-right:.3em"></i>${t('favourites')}`
                            : `${t('grp_prefix')}${ACTIVE_FILTER.value}`)
                        : t('filter')}</span>
                </button>
                <div class="tl-filter-menu" id="tbl-filter-menu" style="display:none">
                    <div class="tl-filter-section">Grupper</div>
                    <div class="tl-filter-groups">
                        ${groups.map(g => `<button class="tl-filter-grp${activeGrp === g ? ' selected' : ''}" onclick="setGroupFilter('${g}');closeTblFilterMenu()">Gr. ${g}</button>`).join('')}
                    </div>
                    <div class="tl-filter-section">Lag</div>
                    <div class="tl-filter-teams">
                        <button class="tl-filter-team${activeTeam === 'Norway' ? ' selected' : ''}" onclick="setTeamFilter('Norway');closeTblFilterMenu()">${TEAMS['Norway']?.flag_id ? `<svg class="flag-svg" aria-hidden="true"><use href="#${TEAMS['Norway'].flag_id}"/></svg>` : '🇳🇴'} Norway</button>
                        ${favTeams2.length > 0 ? `<div class="tl-filter-divider"></div>${FAVORITE_TEAMS.filter(n => n !== 'Norway').length > 0 ? `<button class="tl-filter-team tl-filter-favorites${ACTIVE_FILTER?.type === 'favorites' ? ' selected' : ''}" onclick="setFavoritesFilter();closeTblFilterMenu()"><i class="bi bi-heart-fill"></i> ${t('fav_count', FAVORITE_TEAMS.filter(n => n !== 'Norway').length)}</button>` : ''}${favTeams2.map(([name, td]) => `<button class="tl-filter-team${activeTeam === name ? ' selected' : ''}" onclick="setTeamFilter('${name}');closeTblFilterMenu()">${td.flag_id ? `<svg class="flag-svg" aria-hidden="true"><use href="#${td.flag_id}"/></svg>` : (td.flag || '')} ${teamName(name)}</button>`).join('')}` : ''}
                        <div class="tl-filter-divider"></div>
                        ${otherTeams2.map(([name, td]) => `<button class="tl-filter-team${activeTeam === name ? ' selected' : ''}" onclick="setTeamFilter('${name}');closeTblFilterMenu()">${td.flag_id ? `<svg class="flag-svg" aria-hidden="true"><use href="#${td.flag_id}"/></svg>` : (td.flag || '')} ${teamName(name)}</button>`).join('')}
                    </div>
                </div>
            </div>
            ${ACTIVE_FILTER ? `<button class="tl-filter-clear-btn" onclick="clearFilter()"><i class="bi bi-x"></i> ${t('reset')}</button>` : ''}
        </div>
        <div class="tl-toolbar-right">
            <button class="tl-highlight-toggle${TBL_REST_DAYS ? ' on' : ''}" onclick="toggleTblRestDays()" title="${TBL_REST_DAYS ? t('hide_rest') : t('show_rest')}">
                <i class="bi bi-calendar-minus"></i>
            </button>
            <button class="tl-highlight-toggle${HIGHLIGHTS_ON ? ' on' : ''}" onclick="toggleHighlights()" title="${HIGHLIGHTS_ON ? t('hide_hl') : t('show_hl')}">
                <i class="bi bi-heart${HIGHLIGHTS_ON ? '-fill' : ''}"></i>
            </button>
        </div>
    `;
}

function toggleTblRestDays() {
    TBL_REST_DAYS = !TBL_REST_DAYS;
    saveTblRestDays();
    buildTable();
    renderTblToolbar();
}

function toggleTblFilterMenu() {
    const menu = document.getElementById('tbl-filter-menu');
    const wrap = document.getElementById('tbl-filter-wrap') || menu?.closest('.tl-filter-wrap');
    const btn  = document.getElementById('tbl-filter-toggle');
    if (!menu) return;
    const open = menu.style.display !== 'none';
    menu.style.display = open ? 'none' : 'block';
    btn?.setAttribute('aria-expanded', String(!open));
    if (!open) {
        const handler = (e) => {
            if (wrap && wrap.contains(e.target)) return;
            closeTblFilterMenu();
            document.removeEventListener('pointerdown', handler, true);
        };
        setTimeout(() => document.addEventListener('pointerdown', handler, true), 0);
    }
}

function closeTblFilterMenu() {
    const menu = document.getElementById('tbl-filter-menu');
    const btn  = document.getElementById('tbl-filter-toggle');
    if (menu) menu.style.display = 'none';
    btn?.setAttribute('aria-expanded', 'false');
}

function toggleTlFilterMenu() {
    const menu = document.getElementById('tl-filter-menu');
    const wrap = document.getElementById('tl-filter-wrap') || menu?.closest('.tl-filter-wrap');
    const btn  = document.getElementById('tl-filter-toggle');
    if (!menu) return;
    const open = menu.style.display !== 'none';
    menu.style.display = open ? 'none' : 'block';
    btn?.setAttribute('aria-expanded', String(!open));
    if (!open) {
        const handler = (e) => {
            if (wrap && wrap.contains(e.target)) return;
            closeTlFilterMenu();
            document.removeEventListener('pointerdown', handler, true);
        };
        setTimeout(() => document.addEventListener('pointerdown', handler, true), 0);
    }
}

function closeTlFilterMenu() {
    const menu = document.getElementById('tl-filter-menu');
    const btn  = document.getElementById('tl-filter-toggle');
    if (menu) menu.style.display = 'none';
    btn?.setAttribute('aria-expanded', 'false');
}

function renderFilterPill() {
    // Fjernet — filter vises i toolbar på tidslinje og tabell
    const pill = document.getElementById('filter-pill');
    if (pill) pill.remove();
}

// ── Tidslinje ─────────────────────────────────────────────────────────────────
// Dato-kolonne-bredde: smal på mobil, normal på desktop
function getDateColWidth() {
    return window.innerWidth <= 700 ? 52 : 90;
}

function buildTimeline() {
    const tl = document.getElementById('tl');
    tl.innerHTML = '';
    tl.style.setProperty('--cols', TL_COLS);
    const dateCol = getDateColWidth();
    // Lokal midnatt i CEST-koordinater — brukes i akse og grid
    const localMidnightCEST = 24 + (2 - currentTZ().offset);

    // Bygg tidsakse i den ytre sticky-wrapperen (utenfor overflow-elementet)
    const axisOuter = document.getElementById('tl-axis-outer');
    if (axisOuter) {
        axisOuter.innerHTML = '';
        axisOuter.style.setProperty('--cols', TL_COLS);
        axisOuter.className = 'tl-axis';
        axisOuter.style.gridTemplateColumns = `${dateCol}px repeat(${TL_COLS}, 1fr)`;
        axisOuter.innerHTML = `<div class="tl-axis-label">${currentTZ().label}</div>`;

        for (let i = 0; i < TL_COLS; i++) {
            const t      = TL_START + i * TL_STEP;
            const localT = toLocalT(t);
            const h      = Math.floor(localT) % 24;
            const isHalf = (t % 1) !== 0;
            const isMid  = Math.abs(t - localMidnightCEST) < 0.01 && !isHalf;
            const cls    = isMid ? 'midnight' : isHalf ? 'half' : 'whole';
            const timeLabel = isHalf ? '' : `${String(((h % 24) + 24) % 24).padStart(2,'0')}:00`;
            const cell = document.createElement('div');
            cell.className = `tl-axis-hour ${cls}`;
            cell.textContent = timeLabel;
            axisOuter.appendChild(cell);
        }

        // Bredde synkroniseres via JS etter at tl-inner er ferdig lagt ut.
        // tl-inner er i .tl-wrap (overflow:auto), tl-axis-outer er i .tl-axis-wrap —
        // de er i separate containere, så 1fr beregnes ulikt. Vi kopierer offsetWidth.
        const tlInner = document.getElementById('tl');
        function syncAxisWidth() {
            if (!axisOuter || !tlInner) return;
            // Bruk offsetWidth på tl-inner — dette er den faktiske renderte bredden
            // inkl. alle kolonner, uavhengig av overflow
            const w = tlInner.offsetWidth;
            if (w > 100) {
                axisOuter.style.width = w + 'px';
                axisOuter.style.minWidth = w + 'px';
            }
        }
        // Kjør etter at DOM er ferdig rendret
        requestAnimationFrame(() => {
            syncAxisWidth();
            requestAnimationFrame(syncAxisWidth); // dobbel rAF for mobil
        });
        if (window._axisResizeObserver) window._axisResizeObserver.disconnect();
        window._axisResizeObserver = new ResizeObserver(() => requestAnimationFrame(syncAxisWidth));
        if (tlInner) window._axisResizeObserver.observe(tlInner);

        // Synkroniser horisontal scroll mellom aksen og innholdet
        // Bruker en navngitt funksjon slik at vi kan fjerne den ved rebuild
        const tlWrap = document.getElementById('tl-wrap');
        const axisWrap = document.getElementById('tl-axis-wrap');
        if (tlWrap && axisWrap) {
            // Fjern gammel listener hvis den finnes
            if (tlWrap._axisScrollHandler) {
                tlWrap.removeEventListener('scroll', tlWrap._axisScrollHandler);
            }
            tlWrap._axisScrollHandler = () => {
                axisWrap.scrollLeft = tlWrap.scrollLeft;
            };
            tlWrap.addEventListener('scroll', tlWrap._axisScrollHandler, { passive: true });

            // Fjern gamle touch-listeners
            if (tlWrap._touchStartHandler) {
                tlWrap.removeEventListener('touchstart', tlWrap._touchStartHandler);
                tlWrap.removeEventListener('touchmove',  tlWrap._touchMoveHandler);
            }
            // overflow-y: hidden på .tl-wrap hindrer vertikal scroll fysisk.
            // Ingen ekstra touch-logikk nødvendig.
        }
    }

    const days = groupByDay(MATCHES);
    let lastType = null, rowAlt = false;
    const secLabels = {
        g: t('sec_group'),
        r32: t('sec_r32'),
        r16: t('sec_r16'),
        qf: t('sec_qf'),
        sf: t('sec_sf'),
        fin: t('sec_fin')
    };

    const matchDates = new Set(days.map(d => d.isoDate));
    const firstDate  = new Date(days[0].isoDate + 'T12:00:00');
    const lastDate   = new Date(days[days.length-1].isoDate + 'T12:00:00');

    const allDays = [];
    const cursor  = new Date(firstDate);
    while (cursor <= lastDate) {
        const iso = cursor.toISOString().slice(0,10);
        allDays.push(matchDates.has(iso)
            ? { type:'match', data: days.find(d => d.isoDate === iso) }
            : { type:'rest', iso });
        cursor.setDate(cursor.getDate() + 1);
    }

    // ── Hjelpefunksjoner ───────────────────────────────────────────────────────
    function matchesFilter(m) {
        if (!ACTIVE_FILTER) return true;
        if (ACTIVE_FILTER.type === 'team') return m.team1 === ACTIVE_FILTER.value || m.team2 === ACTIVE_FILTER.value;
        if (ACTIVE_FILTER.type === 'group') return m.grp === ACTIVE_FILTER.value;
        if (ACTIVE_FILTER.type === 'favorites') return FAVORITE_TEAMS.some(t => m.team1 === t || m.team2 === t);
        return true;
    }

    function collapseRestGaps(arr) {
        const secLabelsKO = {
            r32: t('sec_r32'), r16: t('sec_r16'),
            qf: t('sec_qf'), sf: t('sec_sf'), fin: t('sec_fin')
        };
        const out = [];
        let restStart = null, restEnd = null;
        let currentGapType = null; // KO-type for nåværende gap-seksjon

        function flushGap() {
            if (!restStart) return;
            const s = new Date(restStart + 'T12:00:00');
            const d = new Date(restEnd   + 'T12:00:00');
            out.push({ type: 'rest-gap', iso: restStart, days: Math.round((d - s) / 86400000) + 1, sectionType: currentGapType });
            restStart = null; restEnd = null;
        }

        for (const e of arr) {
            if (e.type === 'rest') {
                // Finn hvilken KO-type denne datoen tilhører (fra allDays)
                const origDay = days.find(d => d.isoDate === e.iso);
                const dayType = origDay?.type || null;
                const isNewKOType = dayType && secLabelsKO[dayType] && dayType !== currentGapType;

                if (isNewKOType && restStart) {
                    // Ny KO-seksjon — flush forrige gap og start ny
                    flushGap();
                    currentGapType = dayType;
                } else if (!restStart) {
                    currentGapType = dayType || currentGapType;
                }

                if (!restStart) restStart = e.iso;
                restEnd = e.iso;
            } else {
                flushGap();
                currentGapType = null;
                out.push(e);
            }
        }
        flushGap();
        return out;
    }

    // ── Kategoriser dager ────────────────────────────────────────────────────
    // past:     alle kamper ferdigspilt
    // upcoming: ikke ferdigspilt ennå
    // Finn siste fortidsdag (forrige kampdag) og skill den ut
    const nowMs = Date.now();

    const activeBracketPaths = ACTIVE_FILTER?.type === 'team'
        ? getTeamBracketPaths(ACTIVE_FILTER.value)
        : ACTIVE_FILTER?.type === 'group'
        ? (() => {
            // Slå sammen bracket-paths for alle lag i gruppen
            const combined = new Map();
            const grpTeams = Object.entries(TEAMS)
                .filter(([, td]) => !td._alias && td.group === ACTIVE_FILTER.value)
                .map(([name]) => name);
            grpTeams.forEach(teamName => {
                getTeamBracketPaths(teamName).forEach((val, num) => {
                    if (!combined.has(num)) combined.set(num, val);
                    else {
                        const ex = combined.get(num);
                        if (!ex.via.includes(val.via)) ex.via += ' / ' + val.via;
                    }
                });
            });
            return combined;
        })()
        : ACTIVE_FILTER?.type === 'favorites'
        ? (() => {
            const combined = new Map();
            FAVORITE_TEAMS.forEach(teamName => {
                getTeamBracketPaths(teamName).forEach((val, num) => {
                    if (!combined.has(num)) combined.set(num, val);
                    else {
                        const ex = combined.get(num);
                        if (!ex.via.includes(val.via)) ex.via += ' / ' + val.via;
                    }
                });
            });
            return combined;
        })()
        : new Map();
    const activePotentialNums = new Set(
        [...activeBracketPaths.keys()]
            .filter(n => n != null)
            .filter(n => {
                const m = MATCHES.find(x => x.num === n);
                if (!m) return true;
                if (ACTIVE_FILTER?.type === 'team') {
                    // Ekskluder kamper der filterlaget faktisk spiller
                    return m.team1 !== ACTIVE_FILTER.value && m.team2 !== ACTIVE_FILTER.value;
                }
                if (ACTIVE_FILTER?.type === 'group') {
                    // Ekskluder kamper der et lag fra gruppen faktisk spiller
                    const grpTeams = Object.entries(TEAMS)
                        .filter(([, td]) => !td._alias && td.group === ACTIVE_FILTER.value)
                        .map(([name]) => name);
                    return !grpTeams.some(name => m.team1 === name || m.team2 === name);
                }
                if (ACTIVE_FILTER?.type === 'favorites') {
                    return !FAVORITE_TEAMS.some(name => m.team1 === name || m.team2 === name);
                }
                return true;
            })
    );

    let effectiveDays = allDays;

    // Hjelpefunksjon for gruppe-filter: KO-kamper der et gruppe-lag spiller
    function matchesFilterKO(m) {
        if (!ACTIVE_FILTER) return false;
        if (matchesFilter(m)) return true;
        if (ACTIVE_FILTER.type === 'group') {
            const grpTeams = Object.entries(TEAMS)
                .filter(([, td]) => !td._alias && td.group === ACTIVE_FILTER.value)
                .map(([name]) => name);
            return grpTeams.some(name => m.team1 === name || m.team2 === name);
        }
        return false;
    }

    if (ACTIVE_FILTER) {
        const potentialNums = activePotentialNums;

        function matchesFilterOrPotential(m) {
            if (matchesFilter(m)) return true;
            return potentialNums.size > 0 && potentialNums.has(m.num);
        }

        // Finn kampdag-datoer som er relevante for dette filteret
        // For gruppe-filter: inkluder alle KO-kamper der en gruppe-lag spiller
        function matchesFilterDirect(m) {
            return matchesFilterKO(m);
        }

        // Finn kampdag-datoer som er relevante for dette filteret
        // Dag-level: kun dager der laget faktisk spiller (direkte filter)
        // Potensielle KO-dager legges til separat under
        const filterMatchDates = new Set(
            days.filter(d => d.matches.some(matchesFilterDirect)).map(d => d.isoDate)
        );
        // KO-dager med potensielle kamper
        const potentialMatchDates = new Set(
            days.filter(d => d.matches.some(m => potentialNums.has(m.num))).map(d => d.isoDate)
        );
        const allRelevantDates = new Set([...filterMatchDates, ...potentialMatchDates]);

        if (allRelevantDates.size === 0) {
            effectiveDays = allDays; // Ingen treff — vis alt ufiltrert
        } else {
            const sortedDates = [...allRelevantDates].sort();
            // Strekk alltid til siste kampdag i turneringen (ikke bare lagets siste kamp)
            const lastTournamentISO = allDays[allDays.length - 1]?.type === 'match'
                ? allDays[allDays.length - 1].data.isoDate
                : allDays.filter(e => e.type === 'match').pop()?.data.isoDate;
            const lastFilterISO = lastTournamentISO || sortedDates[sortedDates.length - 1];

            // Ta med alle dager fra start til siste relevante kampdag
            effectiveDays = allDays.filter(e => {
                const iso = e.type === 'match' ? e.data.isoDate : e.iso;
                return iso <= lastFilterISO;
            });

            // Konverter dager uten relevante kamper til hviledag-rader.
            // Dager med potensielle KO-kamper beholdes som kamprad (kun den potensielle
            // kampblokken vises, dimming skjer i buildDayEntry for andre kamper).
            effectiveDays = effectiveDays.map(e => {
                if (e.type !== 'match') return e;
                const iso = e.data.isoDate;
                if (filterMatchDates.has(iso) || potentialMatchDates.has(iso)) return e;
                return { type: 'rest', iso };
            });

            // Kollapser påfølgende hviledag-rader til rest-gap
            effectiveDays = collapseRestGaps(effectiveDays);
        }
    }

    // Del effectiveDays i past/future.
    function entryIso(e) {
        if (e.type === 'match') return e.data.isoDate;
        return e.iso;
    }

    const pastDays   = effectiveDays.filter(e => isDayPast(entryIso(e)));
    const futureDays = effectiveDays.filter(e => !isDayPast(entryIso(e)));

    // Finn siste kampdag i fortid
    const lastPastMatchDay = [...pastDays].reverse().find(e => e.type === 'match');
    const prevDayISO = lastPastMatchDay?.data?.isoDate;

    // Ved aktivt filter: vis alle pastDays i rekkefølge uten å skjule noe bak knapp.
    // Uten filter: skjul alt eldre enn forrige kampdag bak "Last inn"-knapp.
    let olderDays, prevDayEntries;
    if (ACTIVE_FILTER) {
        olderDays = [];
        prevDayEntries = pastDays; // vis alle fortidsdager i rekkefølge
    } else {
        olderDays = pastDays.filter(e => {
            if (e.type === 'rest-gap') return false;
            return entryIso(e) !== prevDayISO;
        });
        prevDayEntries = pastDays.filter(e => {
            if (e.type === 'rest-gap') return true;
            return entryIso(e) === prevDayISO;
        });
    }

    // ── Bygg "Last inn tidligere kamper"-knapp ────────────────────────────────
    if (olderDays.length > 0) {
        const totalMatches = olderDays.filter(e => e.type === 'match')
            .reduce((s, e) => s + e.data.matches.length, 0);
        const firstEntry = olderDays.find(e => e.type === 'match');
        const lastEntry  = [...olderDays].reverse().find(e => e.type === 'match');
        const rangeLabel = firstEntry && lastEntry && firstEntry !== lastEntry
            ? `${firstEntry.data.date} – ${lastEntry.data.date}`
            : firstEntry ? firstEntry.data.date : '';

        const loadGroup = document.createElement('div');
        loadGroup.className = 'tl-load-group';

        const loadBtn = document.createElement('button');
        loadBtn.className = 'tl-load-btn';
        loadBtn.innerHTML = `<i class="bi bi-chevron-up"></i> ${t('load_more')} (${totalMatches}) — ${rangeLabel}`;
        loadBtn.addEventListener('click', () => {
            loadGroup.classList.add('open');
            loadBtn.style.display = 'none';
        });
        loadGroup.appendChild(loadBtn);

        const loadContent = document.createElement('div');
        loadContent.className = 'tl-load-content';
        olderDays.forEach(entry => buildDayEntry(entry, loadContent, true));
        loadGroup.appendChild(loadContent);
        tl.appendChild(loadGroup);
    }

    // ── Forrige kampdag — alltid synlig, dempet ───────────────────────────────
    // Ved aktivt filter: legg til "Gruppespill"-overskrift aller først om første relevante type er 'g'
    if (ACTIVE_FILTER) {
        const firstMatchType = effectiveDays.find(e => e.type === 'match')?.data?.type;
        if (firstMatchType === 'g' && lastType !== 'g') {
            const sec = document.createElement('div');
            sec.className = 'tl-section';
            sec.innerHTML = `<span>${t('sec_group')}</span>`;
            tl.appendChild(sec);
            lastType = 'g';
        }
    }
    prevDayEntries.forEach(entry => buildDayEntry(entry, tl, true));

    // ── Fremtidige dager ──────────────────────────────────────────────────────
    futureDays.forEach(entry => buildDayEntry(entry, tl, false));

    // Render toolbar (filter + highlight-switch) over tidslinjen
    renderTlToolbar();
    renderTblToolbar();

    function buildDayEntry(entry, container, isPast) {
        if (entry.type === 'rest') {
            const restRow = document.createElement('div');
            restRow.className = 'tl-rest';
            restRow.style.gridTemplateColumns = `${dateCol}px 1fr`;
            const d = new Date(entry.iso + 'T12:00:00');
            const dayName = t('days')[d.getDay()];
            const mo = t('months');
            restRow.innerHTML = `<div class="tl-rest-label"><strong>${dayName}</strong> ${d.getDate()}. ${mo[d.getMonth()]}</div><div class="tl-rest-line"></div>`;
            container.appendChild(restRow);
            return;
        }

        if (entry.type === 'rest-gap') {
            // Vis seksjonsoverskrift for KO-runden som begynner i dette gapet
            const secLabelsKO = {
                r32: t('sec_r32'), r16: t('sec_r16'),
                qf: t('sec_qf'), sf: t('sec_sf'), fin: t('sec_fin')
            };
            if (entry.sectionType && secLabelsKO[entry.sectionType] && entry.sectionType !== lastType) {
                const sec = document.createElement('div');
                sec.className = 'tl-section';
                sec.innerHTML = `<span>${secLabelsKO[entry.sectionType]}</span>`;
                container.appendChild(sec);
                lastType = entry.sectionType;
            }

            // Vis én tl-rest-rad per dag i gapet
            const startD = new Date(entry.iso + 'T12:00:00');
            const mo = t('months');
            const dayNames = t('days');
            for (let d = 0; d < entry.days; d++) {
                const cur = new Date(startD);
                cur.setDate(cur.getDate() + d);
                const restRow = document.createElement('div');
                restRow.className = 'tl-rest';
                restRow.style.gridTemplateColumns = `${dateCol}px 1fr`;
                restRow.innerHTML = `<div class="tl-rest-label"><strong>${dayNames[cur.getDay()]}</strong> ${cur.getDate()}. ${mo[cur.getMonth()]}</div><div class="tl-rest-line"></div>`;
                container.appendChild(restRow);
            }
            return;
        }

        const day = entry.data;
        if (day.type !== lastType) {
            const lbl = secLabels[day.type];
            if (lbl) {
                const sec = document.createElement('div');
                sec.className = 'tl-section';
                sec.innerHTML = `<span>${lbl}</span>`;
                container.appendChild(sec);
            }
            lastType = day.type; rowAlt = false;
        }

        const sorted  = [...day.matches].sort((a,b) => a.t - b.t);
        const rowEnds = [];
        const placed  = sorted.map(m => {
            let ri = 0;
            while (rowEnds[ri] !== undefined && rowEnds[ri] > m.t - 0.05) ri++;
            rowEnds[ri] = m.t + MATCH_DUR;
            return { ...m, ri };
        });

        const typeClass = {
            g: rowAlt ? 'type-g-b' : 'type-g-a',
            r32:'type-ko', r16:'type-ko',
            qf:'type-sf', sf:'type-sf',
            fin:'type-fin'
        }[day.type] || 'type-g-a';
        rowAlt = !rowAlt;

        const row = document.createElement('div');
        row.className = `tl-row ${typeClass}${isPast ? ' past' : ''}`;
        const BLOCK_GAP = TL_COMPACT ? 40 : 54;
        row.style.minHeight = (BLOCK_GAP + (rowEnds.length - 1) * BLOCK_GAP) + 'px';
        row.style.gridTemplateColumns = `${dateCol}px 1fr`;
        row.innerHTML = `<div class="tl-date"><strong>${day.day}</strong>${day.date}</div>`;

        const area = document.createElement('div');
        area.className = 'tl-matches';
        area.style.position = 'relative';

        const grid = document.createElement('div');
        grid.className = 'tl-grid';
        grid.style.setProperty('--cols', TL_COLS);
        for (let i = 0; i < TL_COLS; i++) {
            const t      = TL_START + i * TL_STEP;
            const localT = toLocalT(t);
            const h      = Math.floor(localT) % 24;
            const isHalf = (t % 1) !== 0;
            const isMid  = Math.abs(t - localMidnightCEST) < 0.01 && !isHalf;
            grid.innerHTML += `<div class="tl-grid-col${isMid?' midnight':isHalf?' half':''}"></div>`;
        }
        area.appendChild(grid);

        placed.forEach(m => {
            const sc  = scoreStr(m.score);
            const st  = STADIUMS[m.v] || {};
            const tip = `${m.flag1} ${teamName(m.team1)} v ${teamName(m.team2)} ${m.flag2} — ${fmtT(m.t)} — ${st.name||m.ground}`;
            const isNorway = m.team1 === 'Norway' || m.team2 === 'Norway';
            const potentialNorway = HIGHLIGHTS_ON && !isNorway && NORWAY_POTENTIAL_MATCHES.has(m.num);
            const isFavMatch = HIGHLIGHTS_ON && !isNorway && (FAVORITE_TEAMS.includes(m.team1) || FAVORITE_TEAMS.includes(m.team2));
            const isNorwayHighlight = HIGHLIGHTS_ON && isNorway;
            const isPotentialFilter = ACTIVE_FILTER && activePotentialNums.has(m.num);
            const isDimmed = ACTIVE_FILTER && !matchesFilter(m) && !isPotentialFilter && !matchesFilterKO(m);
            const viaLabel = isPotentialFilter ? (activeBracketPaths.get(m.num)?.via || '') : '';

            // Vis kampnummer (#90) hvis W{num} refereres i en fremtidig uspilt kamp
            const showNum = m.num != null && m.type !== 'g' &&
                MATCHES.some(x => x.num != null && !x.score?.ft &&
                    (x.team1 === `W${m.num}` || x.team2 === `W${m.num}` ||
                     x.team1 === `L${m.num}` || x.team2 === `L${m.num}`));

            const block = document.createElement('div');
            block.className = `tl-match c-${m.grp}${sc?' has-score':''}${isNorwayHighlight?' norway':''}${potentialNorway?' norway-potential':''}${isFavMatch?' fav-match':''}${isDimmed?' dimmed':''}${!TL_COMPACT?' expanded':''}`;
            block.style.cssText = `left:${tlPct(m.t)}%;width:${tlW()}%;top:${3+m.ri*BLOCK_GAP}px`;
            block.title = tip;
            const city = st.city || m.ground || '';
            const footerHtml = !TL_COMPACT
                ? `<div class="tl-match-footer">${city ? `<span class="tl-match-city">${city}</span>` : ''}${m.tv ? `<span class="tl-match-tv tl-tv-${m.tv.toLowerCase()}">${m.tv}</span>` : ''}</div>`
                : '';
            block.innerHTML =
                `<div class="tl-match-main">` +
                `<span class="tl-match-time">${fmtT(toLocalT(m.t))}</span>` +
                (viaLabel ? `<span class="tl-match-via">${viaLabel}</span>` : '') +
                `<span class="tl-flag">${m.flag1}</span>` +
                `<span class="tl-match-name">${teamName(m.team1)} v ${teamName(m.team2)}</span>` +
                `<span class="tl-flag" style="margin-left:2px">${m.flag2}</span>` +
                (sc ? `<span class="tl-match-score">${sc}</span>` : '') +
                `</div>` +
                footerHtml;
            block.addEventListener('click', () => openModal(m));
            area.appendChild(block);

            // Kampnummer-badge utenfor blokken (ikke påvirket av overflow:hidden)
            if (showNum) {
                const numBadge = document.createElement('div');
                numBadge.className = 'tl-match-num';
                numBadge.textContent = `#${m.num}`;
                numBadge.style.cssText = `left:calc(${tlPct(m.t)}% + ${tlW()}%);top:${3+m.ri*BLOCK_GAP+8}px`;
                area.appendChild(numBadge);
            }
        });

        row.appendChild(area);
        container.appendChild(row);
    } // end buildDayEntry

} // end buildTimeline

// ── Vertikalt rutenett (datoer horisontalt, tidspunkter vertikalt) ────────────
// Arkitektur: absolutt-posisjonering per dag-kolonne, identisk logikk som buildTimeline.
const VG_ROW_H    = 20;  // px per halvtime-enhet — kompakt
const VG_COL_W    = 120; // px normal dag-kolonne
const VG_COL_W_C  = 72;  // px kompakt dag-kolonne
const VG_REST_W   = 28;  // px smal hviledags-kolonne

// VG_SHOW_ALL: true etter at "Last inn tidligere"-knappen er klikket i rutenett
let VG_SHOW_ALL = false;
function saveVgCompact() { localStorage.setItem('vgCompact', String(VG_COMPACT)); }
function toggleVgCompact() { VG_COMPACT = !VG_COMPACT; saveVgCompact(); buildVerticalGrid(); }

function buildVerticalGrid() {
    const vg = document.getElementById('vg');
    if (!vg) return;
    vg.innerHTML = '';
    vg.dataset.built = '1';

    const nowMs = Date.now();

    // Tidsvindu: identisk med tidslinjen (TL_START–TL_END i CEST)
    const ticks = [];
    for (let tt = TL_START; tt < TL_END; tt += TL_STEP) ticks.push(tt);
    const colH = ticks.length * VG_ROW_H;

    function tToY(cestT) {
        let off = cestT - TL_START;
        if (off < 0) off += 24;
        return Math.max(0, (off / TL_STEP) * VG_ROW_H);
    }

    // ── Filter-hjelpere ───────────────────────────────────────────────────────
    function matchesFilter(m) {
        if (!ACTIVE_FILTER) return true;
        if (ACTIVE_FILTER.type === 'team')      return m.team1 === ACTIVE_FILTER.value || m.team2 === ACTIVE_FILTER.value;
        if (ACTIVE_FILTER.type === 'group')     return m.grp === ACTIVE_FILTER.value;
        if (ACTIVE_FILTER.type === 'favorites') return FAVORITE_TEAMS.some(f => m.team1 === f || m.team2 === f);
        return true;
    }
    function matchesFilterKO(m) {
        if (!ACTIVE_FILTER) return false;
        if (matchesFilter(m)) return true;
        if (ACTIVE_FILTER.type === 'group') {
            const grpTeams = Object.entries(TEAMS).filter(([, td]) => !td._alias && td.group === ACTIVE_FILTER.value).map(([n]) => n);
            return grpTeams.some(n => m.team1 === n || m.team2 === n);
        }
        return false;
    }

    const activeBracketPaths = ACTIVE_FILTER?.type === 'team'
        ? getTeamBracketPaths(ACTIVE_FILTER.value)
        : ACTIVE_FILTER?.type === 'group'
        ? (() => {
            const c = new Map();
            Object.entries(TEAMS).filter(([, td]) => !td._alias && td.group === ACTIVE_FILTER.value).map(([n]) => n)
                .forEach(tn => getTeamBracketPaths(tn).forEach((val, num) => {
                    if (!c.has(num)) c.set(num, val);
                    else { const ex = c.get(num); if (!ex.via.includes(val.via)) ex.via += ' / ' + val.via; }
                }));
            return c;
        })()
        : ACTIVE_FILTER?.type === 'favorites'
        ? (() => {
            const c = new Map();
            FAVORITE_TEAMS.forEach(tn => getTeamBracketPaths(tn).forEach((val, num) => {
                if (!c.has(num)) c.set(num, val);
                else { const ex = c.get(num); if (!ex.via.includes(val.via)) ex.via += ' / ' + val.via; }
            }));
            return c;
        })()
        : new Map();

    const activePotentialNums = new Set(
        [...activeBracketPaths.keys()].filter(n => n != null).filter(n => {
            const m = MATCHES.find(x => x.num === n);
            if (!m) return true;
            if (ACTIVE_FILTER?.type === 'team') return m.team1 !== ACTIVE_FILTER.value && m.team2 !== ACTIVE_FILTER.value;
            if (ACTIVE_FILTER?.type === 'group') {
                const g = Object.entries(TEAMS).filter(([, td]) => !td._alias && td.group === ACTIVE_FILTER.value).map(([n]) => n);
                return !g.some(n2 => m.team1 === n2 || m.team2 === n2);
            }
            if (ACTIVE_FILTER?.type === 'favorites') return !FAVORITE_TEAMS.some(n2 => m.team1 === n2 || m.team2 === n2);
            return true;
        })
    );

    // ── Dag-strukturering (identisk med buildTimeline) ────────────────────────
    const days = groupByDay(MATCHES);
    const matchDates = new Set(days.map(d => d.isoDate));
    const firstDate  = new Date(days[0].isoDate + 'T12:00:00');
    const lastDate   = new Date(days[days.length - 1].isoDate + 'T12:00:00');
    const allDays = [];
    const cursor  = new Date(firstDate);
    while (cursor <= lastDate) {
        const iso = cursor.toISOString().slice(0, 10);
        allDays.push(matchDates.has(iso)
            ? { type: 'match', data: days.find(d => d.isoDate === iso) }
            : { type: 'rest',  iso });
        cursor.setDate(cursor.getDate() + 1);
    }

    function entryIso(e) { return e.type === 'match' ? e.data.isoDate : e.iso; }

    function collapseRestGaps(arr) {
        const secLabelsKO = { r32: t('sec_r32'), r16: t('sec_r16'), qf: t('sec_qf'), sf: t('sec_sf'), fin: t('sec_fin') };
        const out = []; let rs = null, re = null, cgt = null;
        function flush() {
            if (!rs) return;
            const s = new Date(rs + 'T12:00:00'), d = new Date(re + 'T12:00:00');
            out.push({ type: 'rest-gap', iso: rs, days: Math.round((d - s) / 86400000) + 1, sectionType: cgt });
            rs = null; re = null;
        }
        for (const e of arr) {
            if (e.type === 'rest') {
                const od = days.find(d => d.isoDate === e.iso), dt = od?.type || null;
                const isNew = dt && secLabelsKO[dt] && dt !== cgt;
                if (isNew && rs) { flush(); cgt = dt; } else if (!rs) cgt = dt || cgt;
                if (!rs) rs = e.iso; re = e.iso;
            } else { flush(); cgt = null; out.push(e); }
        }
        flush(); return out;
    }

    // ── Filtrer effektive dager ───────────────────────────────────────────────
    let effectiveDays = allDays;
    if (ACTIVE_FILTER) {
        const potNums = activePotentialNums;
        const fmDates = new Set(days.filter(d => d.matches.some(m => matchesFilterKO(m))).map(d => d.isoDate));
        const pmDates = new Set(days.filter(d => d.matches.some(m => potNums.has(m.num))).map(d => d.isoDate));
        const relDates = new Set([...fmDates, ...pmDates]);
        if (relDates.size === 0) {
            effectiveDays = allDays;
        } else {
            const lastISO = allDays.filter(e => e.type === 'match').pop()?.data.isoDate || [...relDates].sort().pop();
            effectiveDays = allDays.filter(e => entryIso(e) <= lastISO).map(e => {
                if (e.type !== 'match') return e;
                if (fmDates.has(e.data.isoDate) || pmDates.has(e.data.isoDate)) return e;
                return { type: 'rest', iso: e.data.isoDate };
            });
            effectiveDays = collapseRestGaps(effectiveDays);
        }
    }

    // ── Past / forrige kampdag / fremtid ──────────────────────────────────────
    const pastDays    = effectiveDays.filter(e => isDayPast(entryIso(e)));
    const futureDays  = effectiveDays.filter(e => !isDayPast(entryIso(e)));
    const lastPastM   = [...pastDays].reverse().find(e => e.type === 'match');
    const prevISO     = lastPastM?.data?.isoDate;

    let olderDays, prevDayEntries;
    if (ACTIVE_FILTER || VG_SHOW_ALL) {
        olderDays = [];
        prevDayEntries = pastDays;
    } else {
        olderDays      = pastDays.filter(e => e.type !== 'rest-gap' && entryIso(e) !== prevISO);
        prevDayEntries = pastDays.filter(e => e.type === 'rest-gap' || entryIso(e) === prevISO);
    }

    // ── Verktøylinje ─────────────────────────────────────────────────────────
    let bar = document.getElementById('vg-toolbar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'vg-toolbar';
        document.getElementById('vg-wrap')?.before(bar);
    }
    // Oppdater hint-tekst
    const vgHintText = document.getElementById('vg-hint-text');
    if (vgHintText) vgHintText.textContent = t('scroll_hint_vg');
    const groups        = 'ABCDEFGHIJKL'.split('');
    const teamsArr      = Object.entries(TEAMS).filter(([, td]) => !td._alias && td.group);
    const favTeamsArr   = teamsArr.filter(([n]) => n !== 'Norway' && FAVORITE_TEAMS.includes(n)).sort((a, b) => a[0].localeCompare(b[0]));
    const otherTeamsArr = teamsArr.filter(([n]) => n !== 'Norway' && !FAVORITE_TEAMS.includes(n)).sort((a, b) => a[0].localeCompare(b[0]));
    const activeGrp  = ACTIVE_FILTER?.type === 'group' ? ACTIVE_FILTER.value : null;
    const activeTeam = ACTIVE_FILTER?.type === 'team'  ? ACTIVE_FILTER.value : null;
    bar.className = 'tl-toolbar';
    bar.innerHTML = `
        <div class="tl-toolbar-left">
            <div class="tl-filter-wrap">
                <button class="tl-filter-btn${ACTIVE_FILTER ? ' active' : ''}" onclick="toggleVgFilterMenu()" id="vg-filter-toggle" aria-expanded="false">
                    <i class="bi bi-funnel"></i>
                    <span>${ACTIVE_FILTER
                        ? (ACTIVE_FILTER.type === 'team'
                            ? `${TEAMS[ACTIVE_FILTER.value]?.flag_id ? `<svg class="flag-svg" aria-hidden="true"><use href="#${TEAMS[ACTIVE_FILTER.value].flag_id}"/></svg>` : (TEAMS[ACTIVE_FILTER.value]?.flag || '')} ${ACTIVE_FILTER.value}`
                            : ACTIVE_FILTER.type === 'favorites'
                            ? `<i class="bi bi-heart-fill" style="margin-right:.3em"></i>${t('favourites')}`
                            : `${t('grp_prefix')}${ACTIVE_FILTER.value}`)
                        : t('filter')}</span>
                </button>
                <div class="tl-filter-menu" id="vg-filter-menu" style="display:none">
                    <div class="tl-filter-section">Grupper</div>
                    <div class="tl-filter-groups">
                        ${groups.map(g => `<button class="tl-filter-grp${activeGrp === g ? ' selected' : ''}" onclick="setGroupFilter('${g}');closeVgFilterMenu();buildVerticalGrid()">Gr. ${g}</button>`).join('')}
                    </div>
                    <div class="tl-filter-section">Lag</div>
                    <div class="tl-filter-teams">
                        <button class="tl-filter-team${activeTeam === 'Norway' ? ' selected' : ''}" onclick="setTeamFilter('Norway');closeVgFilterMenu();buildVerticalGrid()">${TEAMS['Norway']?.flag_id ? `<svg class="flag-svg" aria-hidden="true"><use href="#${TEAMS['Norway'].flag_id}"/></svg>` : '🇳🇴'} Norway</button>
                        ${favTeamsArr.length > 0 ? `
                        <div class="tl-filter-divider"></div>
                        ${FAVORITE_TEAMS.filter(n => n !== 'Norway').length > 0 ? `<button class="tl-filter-team tl-filter-favorites${ACTIVE_FILTER?.type === 'favorites' ? ' selected' : ''}" onclick="setFavoritesFilter();closeVgFilterMenu();buildVerticalGrid()"><i class="bi bi-heart-fill"></i> ${t('fav_count', FAVORITE_TEAMS.filter(n => n !== 'Norway').length)}</button>` : ''}
                        ${favTeamsArr.map(([name, td]) => `<button class="tl-filter-team${activeTeam === name ? ' selected' : ''}" onclick="setTeamFilter('${name}');closeVgFilterMenu();buildVerticalGrid()">${td.flag_id ? `<svg class="flag-svg" aria-hidden="true"><use href="#${td.flag_id}"/></svg>` : (td.flag || '')} ${teamName(name)}</button>`).join('')}` : ''}
                        <div class="tl-filter-divider"></div>
                        ${otherTeamsArr.map(([name, td]) => `<button class="tl-filter-team${activeTeam === name ? ' selected' : ''}" onclick="setTeamFilter('${name}');closeVgFilterMenu();buildVerticalGrid()">${td.flag_id ? `<svg class="flag-svg" aria-hidden="true"><use href="#${td.flag_id}"/></svg>` : (td.flag || '')} ${teamName(name)}</button>`).join('')}
                    </div>
                </div>
            </div>
            ${ACTIVE_FILTER ? `<button class="tl-filter-clear-btn" onclick="clearFilter();buildVerticalGrid()" aria-label="Fjern filter"><i class="bi bi-x"></i> ${t('reset')}</button>` : ''}
        </div>
        <div class="tl-toolbar-right">
            <button class="tl-highlight-toggle${TL_MODE === 'vertical' ? ' on' : ''}" onclick="toggleTlMode()" title="${TL_MODE === 'vertical' ? t('tab_timeline') : t('tab_grid')}">
                ${TRANSPOSE_SVG}
            </button>
            <button class="tl-highlight-toggle${VG_COMPACT ? ' on' : ''}" onclick="toggleVgCompact()" title="${VG_COMPACT ? t('expanded_v') : t('compact')}">
                <i class="bi bi-layout-text-sidebar-reverse"></i>
            </button>
            <button class="tl-highlight-toggle${HIGHLIGHTS_ON ? ' on' : ''}" onclick="toggleHighlights();buildVerticalGrid()" title="${HIGHLIGHTS_ON ? t('hide_hl') : t('show_hl')}">
                <i class="bi bi-heart${HIGHLIGHTS_ON ? '-fill' : ''}"></i>
            </button>
        </div>
    `;

    // ── Tids-akse og header — utenfor scroll, synkronisert horisontal scroll ──
    const VG_HEADER_H = 32; // px — høyde på dato-header-raden

    // Tids-akse (venstre, fast) — kun tidspunkter, ingen spacer
    const axisBodyWrap = document.getElementById('vg-axis-body-wrap');
    if (axisBodyWrap) {
        axisBodyWrap.innerHTML = '';
        const axis = document.createElement('div');
        axis.className = 'vg-time-axis';
        axis.style.height = colH + 'px';
        ticks.forEach((cestT, i) => {
            const localT  = toLocalT(cestT);
            const h       = Math.floor(((localT % 24) + 24) % 24);
            const isHalf  = (cestT % 1) !== 0;
            const isMid   = Math.abs(cestT - 24) < 0.01;
            const timeStr = isHalf ? '' : String(h).padStart(2, '0') + ':00';
            const tick    = document.createElement('div');
            tick.className = 'vg-tick' + (isMid ? ' midnight' : isHalf ? ' half' : ' whole');
            tick.style.top = (i * VG_ROW_H) + 'px';
            if (timeStr) tick.textContent = timeStr;
            axis.appendChild(tick);
        });
        axisBodyWrap.appendChild(axis);
    }

    // Hjørne-celle i vg-axis-wrap (TZ-label, over tids-aksen)
    const axisWrap = document.getElementById('vg-axis-wrap');
    if (axisWrap) {
        axisWrap.innerHTML = '';
        const corner = document.createElement('div');
        corner.className = 'vg-corner';
        corner.textContent = currentTZ().label;
        axisWrap.appendChild(corner);
    }

    // headerRow: den separate sticky-raden med dato-celler
    const headerRow = document.getElementById('vg-header-row');
    if (headerRow) headerRow.innerHTML = '';

    // ── Bygg kolonner ─────────────────────────────────────────────────────────

    function makeDateHeader(entry, isPast) {
        const cell = document.createElement('div');
        if (entry.type === 'rest') {
            cell.className = 'vg-date-cell vg-date-rest';
            const d = new Date(entry.iso + 'T12:00:00');
            const day3 = t('days')[d.getDay()].toUpperCase();
            const dd   = String(d.getDate()).padStart(2, '0');
            const mm   = String(d.getMonth() + 1).padStart(2, '0');
            cell.innerHTML =
                '<strong>' + day3 + '</strong>' +
                '<span>' + dd + '.' + mm + '</span>';
            return cell;
        }
        if (entry.type === 'rest-gap') {
            cell.className = 'vg-date-cell vg-date-rest vg-date-gap';
            cell.innerHTML = '<span class="vg-rest-gap-label">' + entry.days + 'd</span>';
            return cell;
        }
        const day = entry.data, d = new Date(day.isoDate + 'T12:00:00'), mo = t('months');
        const day3 = t('days')[d.getDay()].toUpperCase();
        cell.className = 'vg-date-cell' + (isPast ? ' past' : '');
        cell.innerHTML =
            '<strong>' + day3 + '</strong>' +
            '<span>' + d.getDate() + '. ' + mo[d.getMonth()] + '</span>';
        return cell;
    }

    function makeDayCol(entry, isPast) {
        const col = document.createElement('div');
        if (entry.type === 'rest' || entry.type === 'rest-gap') {
            col.className = 'vg-day-col vg-day-rest' + (entry.type === 'rest-gap' ? ' vg-day-gap' : '') + (isPast ? ' past' : '');
            col.style.height = colH + 'px';
            const line = document.createElement('div'); line.className = 'vg-rest-vline'; col.appendChild(line);
            return col;
        }
        const day = entry.data;
        col.className = 'vg-day-col' + (isPast ? ' past' : '');
        col.style.height = colH + 'px';
        ticks.forEach((cestT, i) => {
            const isHalf = (cestT % 1) !== 0, isMid = Math.abs(cestT - 24) < 0.01;
            const line = document.createElement('div');
            line.className = 'vg-grid-line' + (isMid ? ' midnight' : isHalf ? ' half' : '');
            line.style.top = (i * VG_ROW_H) + 'px';
            col.appendChild(line);
        });

        // Beregn antall overlappende kolonner per kamp — identisk logikk som tidslinjen
        const sorted = [...day.matches].sort((a, b) => a.t - b.t);
        const colEnds = []; // slutt-tid per sub-kolonne
        const placed  = sorted.map(m => {
            let ci = 0;
            while (colEnds[ci] !== undefined && colEnds[ci] > m.t - 0.05) ci++;
            colEnds[ci] = m.t + MATCH_DUR;
            return { m, ci };
        });
        const numSubCols = colEnds.length;
        // Returner numSubCols slik at appendCol kan skalere kolonnebredden
        col._numSubCols = numSubCols;

        placed.forEach(({ m, ci }) => {
            const sc = scoreStr(m.score), st = STADIUMS[m.v] || {};
            const isNorway        = m.team1 === 'Norway' || m.team2 === 'Norway';
            const potentialNorway = HIGHLIGHTS_ON && !isNorway && NORWAY_POTENTIAL_MATCHES.has(m.num);
            const isFavMatch      = HIGHLIGHTS_ON && !isNorway && (FAVORITE_TEAMS.includes(m.team1) || FAVORITE_TEAMS.includes(m.team2));
            const isPotFilt       = ACTIVE_FILTER && activePotentialNums.has(m.num);
            const isDimmed        = ACTIVE_FILTER && !matchesFilter(m) && !isPotFilt && !matchesFilterKO(m);
            const mStart          = cestToDate(m.isoDate, m.t).getTime();
            const isLive          = nowMs >= mStart && nowMs <= mStart + MATCH_DUR * 3600000;
            const viaLabel        = isPotFilt ? (activeBracketPaths.get(m.num)?.via || '') : '';
            const showNum         = m.num != null && m.type !== 'g' &&
                MATCHES.some(x => x.num != null && !x.score?.ft &&
                    (x.team1 === 'W' + m.num || x.team2 === 'W' + m.num ||
                     x.team1 === 'L' + m.num || x.team2 === 'L' + m.num));

            const block = document.createElement('div');
            block.className = ['vg-match', 'c-' + m.grp,
                sc ? 'has-score' : '',
                isNorway && HIGHLIGHTS_ON ? 'norway' : '',
                potentialNorway ? 'norway-potential' : '',
                isFavMatch      ? 'fav-match'        : '',
                isDimmed        ? 'dimmed'           : '',
                isLive          ? 'live'             : '',
                VG_COMPACT      ? 'compact'          : '',
            ].filter(Boolean).join(' ');
            block.style.top    = tToY(m.t) + 'px';
            block.style.height = ((MATCH_DUR / TL_STEP) * VG_ROW_H - 2) + 'px';
            // Horisontal fordeling ved overlapp
            if (numSubCols > 1) {
                const pct = 100 / numSubCols;
                block.style.left  = (ci * pct) + '%';
                block.style.width = pct + '%';
                block.style.right = 'auto';
            }
            block.title = m.flag1 + ' ' + teamName(m.team1) + ' v ' + teamName(m.team2) + ' ' + m.flag2 + ' — ' + fmtT(toLocalT(m.t)) + ' — ' + (st.name || m.ground);

            const fifa1 = TEAMS[m.team1]?.code || m.team1.slice(0, 3).toUpperCase();
            const fifa2 = TEAMS[m.team2]?.code || m.team2.slice(0, 3).toUpperCase();
            const name1 = VG_COMPACT ? fifa1 : teamName(m.team1);
            const name2 = VG_COMPACT ? fifa2 : teamName(m.team2);

            block.innerHTML =
                '<div class="vg-match-time">' + fmtT(toLocalT(m.t)) + '</div>' +
                (viaLabel ? '<div class="vg-via">' + viaLabel + '</div>' : '') +
                (showNum  ? '<div class="vg-match-num">#' + m.num + '</div>' : '') +
                '<div class="vg-match-teams"><span class="vg-flag">' + m.flag1 + '</span><span class="vg-team1">' + name1 + '</span></div>' +
                (sc ? '<div class="vg-score">' + sc + '</div>' : '<div class="vg-score-placeholder">v</div>') +
                '<div class="vg-match-teams"><span class="vg-flag">' + m.flag2 + '</span><span class="vg-team2">' + name2 + '</span></div>' +
                (st.city || m.ground ? '<div class="vg-city">' + (st.city || m.ground) + '</div>' : '') +
                (m.tv   ? '<div class="vg-tv tl-tv-' + m.tv.toLowerCase() + '">' + m.tv + '</div>' : '') +
                (isLive ? '<div class="vg-live-badge">' + t('live') + '</div>' : '');
            block.addEventListener('click', () => openModal(m));
            col.appendChild(block);
        }); // end placed.forEach
        return col;
    }

    const secLabelsAll = { g: t('sec_group'), r32: t('sec_r32'), r16: t('sec_r16'), qf: t('sec_qf'), sf: t('sec_sf'), fin: t('sec_fin') };
    let appendSectionType = null;

    // gridEl: kun kolonne-innhold (uten dato-celler)
    const gridEl = document.createElement('div');
    gridEl.className = 'vg-grid';

    function appendCol(entry, isPast, contentContainer, hdrContainer) {
        const baseW = (entry.type === 'rest' || entry.type === 'rest-gap')
            ? VG_REST_W
            : VG_COMPACT ? VG_COL_W_C : VG_COL_W;

        // Skaler kolonnebredden med antall overlappende sub-kolonner —
        // makeDayCol setter col._numSubCols, så vi kaller den én gang tidlig
        const col = makeDayCol(entry, isPast);
        const w = (entry.type === 'rest' || entry.type === 'rest-gap')
            ? baseW
            : baseW * Math.max(1, col._numSubCols || 1);

        let isNewSection = false;
        if (entry.type === 'match') {
            const dayType = entry.data.type;
            if (dayType !== appendSectionType) {
                isNewSection = true;
                appendSectionType = dayType;
            }
        }

        // Header-celle
        if (hdrContainer) {
            const hdrCell = makeDateHeader(entry, isPast);
            hdrCell.style.width    = w + 'px';
            hdrCell.style.minWidth = w + 'px';
            hdrCell.style.flexShrink = '0';
            if (isNewSection) hdrCell.classList.add('vg-section-start');
            hdrContainer.appendChild(hdrCell);
        }

        // Kolonne-innhold — allerede laget ovenfor
        col.style.width    = w + 'px';
        col.style.minWidth = w + 'px';
        col.style.flexShrink = '0';
        if (isNewSection) col.classList.add('vg-section-start');

        if (entry.type === 'match' && appendSectionType && secLabelsAll[appendSectionType]) {
            const lbl = document.createElement('div');
            lbl.className = 'vg-section-label';
            lbl.textContent = secLabelsAll[appendSectionType];
            col.appendChild(lbl);
        }

        contentContainer.appendChild(col);
    }

    // ── "Last inn tidligere"-knapp ────────────────────────────────────────────
    if (olderDays.length > 0) {
        const totalM = olderDays.filter(e => e.type === 'match').reduce((s, e) => s + e.data.matches.length, 0);
        const first  = olderDays.find(e => e.type === 'match');
        const last   = [...olderDays].reverse().find(e => e.type === 'match');
        const range  = first && last && first !== last ? first.data.date + ' – ' + last.data.date : first ? first.data.date : '';

        // Header-del for load-btn — eksakt samme bredde som vg-load-wrap nedenfor
        const LOAD_BTN_W = VG_REST_W; // smal kolonne, samme som hviledager
        if (headerRow) {
            const loadHdr = document.createElement('div');
            loadHdr.className = 'vg-load-header';
            loadHdr.id = 'vg-load-header-btn';
            loadHdr.style.width    = LOAD_BTN_W + 'px';
            loadHdr.style.minWidth = LOAD_BTN_W + 'px';
            loadHdr.style.flexShrink = '0';
            headerRow.appendChild(loadHdr);
        }

        // Knapp i innholdsraden
        const loadWrap = document.createElement('div');
        loadWrap.className = 'vg-load-wrap';
        loadWrap.style.width    = LOAD_BTN_W + 'px';
        loadWrap.style.minWidth = LOAD_BTN_W + 'px';
        loadWrap.style.flexShrink = '0';
        const loadBtn = document.createElement('button');
        loadBtn.className = 'vg-load-btn';
        loadBtn.style.height = colH + 'px';
        loadBtn.innerHTML =
            '<i class="bi bi-chevron-up vg-load-arrow"></i>' +
            '<span class="vg-load-text"> ' + t('load_more') + ' (' + totalM + ') — ' + range + ' </span>' +
            '<i class="bi bi-chevron-up vg-load-arrow"></i>';
        loadBtn.addEventListener('click', () => {
            // Gjenbygg hele rutenettet med alle kamper synlige
            VG_SHOW_ALL = true;
            buildVerticalGrid();
        });
        loadWrap.appendChild(loadBtn);
        gridEl.appendChild(loadWrap);
    }

    prevDayEntries.forEach(e => appendCol(e, true,  gridEl, headerRow));
    futureDays.forEach(    e => appendCol(e, false, gridEl, headerRow));

    // ── Synkroniser horisontal scroll mellom header og innhold ────────────────
    const vgWrap = document.getElementById('vg-wrap');
    const hdrScrollWrap = document.getElementById('vg-header-scroll-wrap');
    if (vgWrap && hdrScrollWrap) {
        if (vgWrap._vgHdrScrollHandler) vgWrap.removeEventListener('scroll', vgWrap._vgHdrScrollHandler);
        vgWrap._vgHdrScrollHandler = () => { hdrScrollWrap.scrollLeft = vgWrap.scrollLeft; };
        vgWrap.addEventListener('scroll', vgWrap._vgHdrScrollHandler, { passive: true });
    }

    // Synkroniser bredden på header-raden med innholdet (som tl-axis-outer)
    function syncHeaderWidth() {
        if (!gridEl || !headerRow) return;
        const w = gridEl.scrollWidth;
        if (w > 100) {
            headerRow.style.width    = w + 'px';
            headerRow.style.minWidth = w + 'px';
        }
    }
    requestAnimationFrame(() => { syncHeaderWidth(); requestAnimationFrame(syncHeaderWidth); });
    if (window._vgResizeObserver) window._vgResizeObserver.disconnect();
    window._vgResizeObserver = new ResizeObserver(() => requestAnimationFrame(syncHeaderWidth));
    if (gridEl) window._vgResizeObserver.observe(gridEl);

    vg.appendChild(gridEl);
}
function toggleVgFilterMenu() {
    const menu = document.getElementById('vg-filter-menu');
    const btn  = document.getElementById('vg-filter-toggle');
    if (!menu) return;
    const isOpen = menu.style.display !== 'none';
    menu.style.display = isOpen ? 'none' : 'block';
    btn?.setAttribute('aria-expanded', String(!isOpen));
    if (!isOpen) {
        const handler = (e) => {
            if (!menu.contains(e.target) && e.target !== btn) {
                menu.style.display = 'none';
                btn?.setAttribute('aria-expanded', 'false');
                document.removeEventListener('pointerdown', handler, true);
            }
        };
        setTimeout(() => document.addEventListener('pointerdown', handler, true), 0);
    }
}

function closeVgFilterMenu() {
    const menu = document.getElementById('vg-filter-menu');
    const btn  = document.getElementById('vg-filter-toggle');
    if (menu) menu.style.display = 'none';
    btn?.setAttribute('aria-expanded', 'false');
}


function buildTable() {
    const tbl = document.getElementById('tbl');
    const nowMs = Date.now();

    const secLabels = {
        g: t('sec_group'), r32: t('sec_r32'), r16: t('sec_r16'),
        qf: t('sec_qf'), sf: t('sec_sf'), fin: t('sec_fin')
    };

    // ── Filter-logikk ─────────────────────────────────────────────────────────
    const filterBracketPaths = ACTIVE_FILTER?.type === 'team'
        ? getTeamBracketPaths(ACTIVE_FILTER.value)
        : ACTIVE_FILTER?.type === 'group'
        ? (() => {
            const combined = new Map();
            Object.entries(TEAMS).filter(([, td]) => !td._alias && td.group === ACTIVE_FILTER.value)
                .forEach(([name]) => getTeamBracketPaths(name).forEach((v, n) => { if (!combined.has(n)) combined.set(n, v); }));
            return combined;
        })()
        : ACTIVE_FILTER?.type === 'favorites'
        ? (() => {
            const combined = new Map();
            FAVORITE_TEAMS.forEach(name => {
                getTeamBracketPaths(name).forEach((v, n) => { if (!combined.has(n)) combined.set(n, v); });
            });
            return combined;
        })()
        : new Map();

    const filterPotentialNums = new Set(
        [...filterBracketPaths.keys()].filter(n => n != null).filter(n => {
            const m = MATCHES.find(x => x.num === n);
            if (!m) return true;
            if (ACTIVE_FILTER?.type === 'team') return m.team1 !== ACTIVE_FILTER.value && m.team2 !== ACTIVE_FILTER.value;
            if (ACTIVE_FILTER?.type === 'group') {
                const grpTeams = Object.entries(TEAMS).filter(([, td]) => !td._alias && td.group === ACTIVE_FILTER.value).map(([n]) => n);
                return !grpTeams.some(name => m.team1 === name || m.team2 === name);
            }
            if (ACTIVE_FILTER?.type === 'favorites') {
                return !FAVORITE_TEAMS.some(name => m.team1 === name || m.team2 === name);
            }
            return true;
        })
    );

    function matchRowFilter(m) {
        if (!ACTIVE_FILTER) return true;
        if (ACTIVE_FILTER.type === 'team') return m.team1 === ACTIVE_FILTER.value || m.team2 === ACTIVE_FILTER.value;
        if (ACTIVE_FILTER.type === 'group') return m.grp === ACTIVE_FILTER.value;
        if (ACTIVE_FILTER.type === 'favorites') return FAVORITE_TEAMS.some(t => m.team1 === t || m.team2 === t);
        return true;
    }

    function matchRowKO(m) {
        if (!ACTIVE_FILTER) return false;
        if (matchRowFilter(m)) return true;
        if (filterPotentialNums.has(m.num)) return true;
        if (ACTIVE_FILTER.type === 'group') {
            const grpTeams = Object.entries(TEAMS).filter(([, td]) => !td._alias && td.group === ACTIVE_FILTER.value).map(([n]) => n);
            return grpTeams.some(name => m.team1 === name || m.team2 === name);
        }
        return false;
    }

    function shouldShowMatch(m) {
        return !ACTIVE_FILTER || matchRowFilter(m) || matchRowKO(m);
    }

    // ── Grupper kamper per kampdag ─────────────────────────────────────────────
    const byDate = {};
    MATCHES.forEach((m, i) => {
        if (!ACTIVE_FILTER || shouldShowMatch(m)) {
            if (!byDate[m.isoDate]) byDate[m.isoDate] = [];
            byDate[m.isoDate].push({ m, i });
        }
    });

    // Ved filter: strekk til turneringens slutt (som i tidslinje)
    let allDates = Object.keys(byDate).sort();
    if (ACTIVE_FILTER && allDates.length > 0) {
        const lastTournamentDate = MATCHES[MATCHES.length - 1]?.isoDate;
        if (lastTournamentDate && lastTournamentDate > allDates[allDates.length - 1]) {
            // Legg til tomme datoer frem til turneringens slutt
            // (vises som seksjonsoverskrifter uten kamper)
            const cursor = new Date(allDates[allDates.length - 1] + 'T12:00:00');
            const last   = new Date(lastTournamentDate + 'T12:00:00');
            while (cursor < last) {
                cursor.setDate(cursor.getDate() + 1);
                const iso = cursor.toISOString().slice(0,10);
                if (!byDate[iso]) byDate[iso] = []; // tom dag — vises kun hvis KO-type skifter
                if (!allDates.includes(iso)) allDates.push(iso);
            }
            allDates.sort();
        }
    }

    const pastDates   = allDates.filter(d => isDayPast(d));
    const futureDates = allDates.filter(d => !isDayPast(d));

    // Finn forrige kampdag (siste fortidsdag med faktiske kamper)
    const prevDate = [...pastDates].reverse().find(d => byDate[d]?.length > 0) || null;
    const olderDates = ACTIVE_FILTER ? [] : pastDates.filter(d => d !== prevDate);

    function buildRows(dates, isPast, startFrom) {
        let html = '';
        let lastType = null, alt = false;
        let lastDisplayedDate = null;

        if (!dates.length) return html;

        // Hvis hviledager er på: bygg komplett kalenderrekke fra startFrom til siste dato
        const mo = t('months');
        const dayNames = t('days');
        const allCalDates = [];
        if (TBL_REST_DAYS) {
            const start = new Date((startFrom || dates[0]) + 'T12:00:00');
            const end   = new Date(dates[dates.length - 1] + 'T12:00:00');
            const cur   = new Date(start);
            while (cur <= end) {
                allCalDates.push(cur.toISOString().slice(0, 10));
                cur.setDate(cur.getDate() + 1);
            }
        } else {
            allCalDates.push(...dates);
        }

        // Skriv seksjonsoverskrift for første kamptype øverst — før hviledag-rader
        const firstEntryDate = allCalDates.find(d => (byDate[d] || []).length > 0);
        if (firstEntryDate) {
            const firstType = MATCHES.find(m => m.isoDate === firstEntryDate)?.type;
            if (firstType && secLabels[firstType]) {
                html += `<tr class="tr-sec"><td colspan="8">${secLabels[firstType]}</td></tr>`;
                lastType = firstType; alt = false;
            }
        }

        allCalDates.forEach(date => {
            const entries = byDate[date] || [];
            const hasEntries = entries.length > 0;

            if (!hasEntries) {
                if (!TBL_REST_DAYS) return;
                // Hviledag-rad
                const d = new Date(date + 'T12:00:00');
                html += `<tr class="tr-rest-day"><td class="tc-day tc-rest-day-label">${dayNames[d.getDay()]} ${d.getDate()}. ${mo[d.getMonth()]}</td><td colspan="7" class="tc-rest-day-line"></td></tr>`;
                return;
            }

            // Seksjonsoverskrift ved type-skifte (ikke ved første gang — allerede skrevet over)
            const dateType = MATCHES.find(m => m.isoDate === date)?.type;
            if (dateType && dateType !== lastType && secLabels[dateType]) {
                html += `<tr class="tr-sec"><td colspan="8">${secLabels[dateType]}</td></tr>`;
                lastType = dateType; alt = false;
            }

            entries.forEach(({ m, i }) => {
                if (m.type !== lastType) { lastType = m.type; alt = false; }
                const trClass = {
                    g: alt ? 'tr-b' : 'tr-a',
                    r32:'tr-ko', r16:'tr-ko', qf:'tr-sf', sf:'tr-sf', fin:'tr-fin'
                }[m.type] || 'tr-a';
                alt = !alt;
                const isNorway = m.team1 === 'Norway' || m.team2 === 'Norway';
                const showDate = lastDisplayedDate !== m.isoDate;
                lastDisplayedDate = m.isoDate;
                const sc = scoreStr(m.score);
                const st = STADIUMS[m.v] || {};
                const tip = `${st.name||m.ground}${st.cap?' · '+st.cap.toLocaleString('no'):''}`;
                const norClass = (HIGHLIGHTS_ON && isNorway) ? ' tr-norway' : '';
                const isFav = HIGHLIGHTS_ON && !isNorway && (FAVORITE_TEAMS.includes(m.team1) || FAVORITE_TEAMS.includes(m.team2));
                const favClass = isFav ? ' tr-fav' : '';
                const pastClass = isPast ? ' tr-past' : '';
                const isPotential = ACTIVE_FILTER && filterPotentialNums.has(m.num);
                const viaLabel = isPotential ? (filterBracketPaths.get(m.num)?.via || '') : '';
                const matchMeta = sc
                    ? `<span class="tc-match-meta">${sc} · ${st.city || m.ground}</span>`
                    : `<span class="tc-match-meta">${fmtT(toLocalT(m.t))}${nextDayBadge(m.t, m.isoDate)} · ${st.city || m.ground}${viaLabel ? ` <span class="tc-via">${viaLabel}</span>` : ''}</span>`;
                const venFlag = st.cc ? `<svg class="flag-svg tc-ven-flag" aria-hidden="true"><use href="#${st.cc}"/></svg>` : '';
                const venName = st.name || m.ground;
                const venRegion = st.region ? `<span class="tc-ven-region">${st.region}</span>` : '';
                const numPrefix = m.num != null ? `<span class="tc-num-inline">#${m.num}</span>` : '';
                const numCell = `<td class="tc-num">${m.num != null ? '#'+m.num : ''}</td>`;
                const tvCell = m.tv ? `<td class="tc-tv"><span class="tc-tv-badge tc-tv-${m.tv.toLowerCase().replace(/\s/g,'-')}">${m.tv}</span></td>` : `<td class="tc-tv"></td>`;
                const regionLabel = st.region ? `${st.region} Region` : '';
                const regionCell = `<td class="tc-region">${regionLabel ? `<span class="tc-region-badge tc-region-${(st.region||'').toLowerCase()}">${regionLabel}</span>` : ''}</td>`;
                html += `<tr class="${trClass}${norClass}${favClass}${pastClass}${isPotential ? ' tr-potential' : ''}" onclick="openModal(MATCHES[${i}])">
                    <td class="tc-day">${showDate ? m.day+'<br>'+m.date : ''}</td>
                    <td class="tc-match">
                        <div class="tc-match-teams">${m.flag1} ${teamName(m.team1)} v ${teamName(m.team2)} ${m.flag2}</div>
                        ${matchMeta}
                    </td>
                    <td class="tc-score">${sc}</td>
                    <td class="tc-grp"><span class="c-${m.grp} tc-grp-badge">${m.grp}</span></td>
                    <td class="tc-ven" title="${tip}">${venFlag}<span class="tc-ven-name">${venName}</span></td>
                    ${regionCell}
                    ${numCell}
                    ${tvCell}
                </tr>`;
            });
        });
        return html;
    }

    // Turneringens første dato — startpunkt for hviledagsrader
    const tournamentFirstDate = MATCHES.find(m => m.type === 'g')?.isoDate || allDates[0];

    // Bygg HTML
    let fullHtml = '';

    // "Last inn tidligere kamper"-knapp (kun uten filter)
    if (!ACTIVE_FILTER && olderDates.length > 0) {
        const totalOlder = olderDates.reduce((s, d) => s + (byDate[d]?.length || 0), 0);
        const firstDate = byDate[olderDates[0]]?.[0]?.m;
        const lastDate  = byDate[olderDates[olderDates.length-1]]?.[0]?.m;
        const rangeLabel = firstDate && lastDate && firstDate !== lastDate
            ? `${firstDate.day} ${firstDate.date} – ${lastDate.day} ${lastDate.date}`
            : firstDate ? `${firstDate.day} ${firstDate.date}` : '';
        fullHtml += `<tr class="tr-load-row" id="tbl-load-row">
            <td colspan="8">
                <button class="tl-load-btn" onclick="document.getElementById('tbl-older').style.display='';document.getElementById('tbl-load-row').style.display='none'">
                    <i class="bi bi-chevron-up"></i> ${t('load_more')} (${totalOlder}) — ${rangeLabel}
                </button>
            </td>
        </tr>
        <tbody id="tbl-older" style="display:none">${buildRows(olderDates, true, tournamentFirstDate)}</tbody>
        <tbody id="tbl-main">`;
    } else {
        fullHtml += `<tbody id="tbl-main">`;
    }

    // Ved filter: vis alle fortidsdager i rekkefølge
    if (ACTIVE_FILTER) {
        fullHtml += buildRows(pastDates, true, tournamentFirstDate);
    } else if (prevDate) {
        fullHtml += buildRows([prevDate], true, tournamentFirstDate);
    }

    // Fremtidige kamper — starter fra turneringens første dag når filter er på
    fullHtml += buildRows(futureDates, false, ACTIVE_FILTER ? tournamentFirstDate : undefined);
    fullHtml += `</tbody>`;

    tbl.innerHTML = fullHtml;
    renderTblToolbar();
}
function buildGroups() {
    const standings = {};
    MATCHES.forEach(m => {
        if (m.type !== 'g' || !m.score?.ft) return;
        const g = m.grp;
        if (!standings[g]) standings[g] = {};
        const [s1, s2] = m.score.ft;
        const init = () => ({ pts:0, gf:0, ga:0, played:0 });
        if (!standings[g][m.team1]) standings[g][m.team1] = init();
        if (!standings[g][m.team2]) standings[g][m.team2] = init();
        standings[g][m.team1].gf += s1; standings[g][m.team1].ga += s2; standings[g][m.team1].played++;
        standings[g][m.team2].gf += s2; standings[g][m.team2].ga += s1; standings[g][m.team2].played++;
        if (s1 > s2)      standings[g][m.team1].pts += 3;
        else if (s1 < s2) standings[g][m.team2].pts += 3;
        else              { standings[g][m.team1].pts += 1; standings[g][m.team2].pts += 1; }
    });

    const grpMap = {};
    Object.entries(TEAMS).forEach(([name, td]) => {
        if (td._alias) return;
        if (!grpMap[td.group]) grpMap[td.group] = [];
        grpMap[td.group].push({ name, ...td });
    });

    const hasAnyResults = Object.keys(standings).length > 0;
    const colorMap = { A:'c-A',B:'c-B',C:'c-C',D:'c-D',E:'c-E',F:'c-F',G:'c-G',H:'c-H',I:'c-I',J:'c-J',K:'c-K',L:'c-L' };

    // Beregn region per gruppe fra kampdata
    const grpRegion = {};
    MATCHES.filter(m => m.type === 'g').forEach(m => {
        if (!grpRegion[m.grp] && STADIUMS[m.v]?.region) grpRegion[m.grp] = STADIUMS[m.v].region;
    });

    // Samle alle treere for å finne beste 4
    const allThirds = [];

    let html = '';
    Object.keys(grpMap).sort().forEach(g => {
        const teams = grpMap[g];
        const st = standings[g] || {};
        const hasResults = Object.keys(st).length > 0; // per gruppe

        if (hasResults) {
            teams.sort((a, b) => {
                const sa = st[a.name] || { pts:0, gf:0, ga:0 };
                const sb = st[b.name] || { pts:0, gf:0, ga:0 };
                if (sb.pts !== sa.pts) return sb.pts - sa.pts;
                if ((sb.gf-sb.ga) !== (sa.gf-sa.ga)) return (sb.gf-sb.ga) - (sa.gf-sa.ga);
                return sb.gf - sa.gf;
            });
        }

        // Finn treeren i denne gruppen (index 2 etter sortering)
        if (hasResults && teams.length >= 3) {
            const third = teams[2];
            const s = st[third.name] || { pts:0, gf:0, ga:0 };
            allThirds.push({ name: third.name, flag: third.flag, group: g, ...s });
        }

        html += `<div class="group-card">
            <div class="group-title ${colorMap[g]||''}" onclick="openGroupModal('${g}')" style="cursor:pointer">${t('grp_prefix')}${g}</div>
            <div class="group-body">`;
        if (hasResults) {
            html += `<div class="group-team group-header-row">
                <span class="group-pos"></span>
                <span class="group-flag" style="visibility:hidden">🏳</span>
                <span class="group-name"></span>
                <span class="group-stats"><span class="group-gd">${t('adv')}</span><span class="group-pts">${t('pts')}</span></span>
                <span class="group-fav-slot"></span>
            </div>`;
        }
        teams.forEach((team, idx) => {
            const s   = st[team.name] || null;
            const gd  = s ? (s.gf - s.ga > 0 ? '+' : '') + (s.gf - s.ga) : '';
            const pts = s ? s.pts : '';
            const statsHtml = s
                ? `<span class="group-stats"><span class="group-gd">${gd}</span><span class="group-pts">${pts}</span></span>`
                : '';
            const isNor = team.name === 'Norway' ? ' norway-team' : '';
            const isFav = FAVORITE_TEAMS.includes(team.name);
            const showFavHeart = HIGHLIGHTS_ON && isFav;
            const favHeart = showFavHeart ? '<i class="bi bi-heart-fill group-fav-heart"></i>' : '';

            // Plasserings-farge: 1+2 = grønn, 3 = gul, 4 = rød
            let posClass = '';
            let posIcon = '';
            if (hasResults) {
                if (idx === 0 || idx === 1) { posClass = ' pos-advance'; posIcon = ''; }
                else if (idx === 2)          { posClass = ' pos-third';   posIcon = ''; }
                else                         { posClass = ' pos-out';     posIcon = ''; }
            }

            html += `<div class="group-team${isNor}${posClass}" onclick="openTeamModal('${team.name}')">
                <span class="group-flag">${team.flag_id ? `<svg class="flag-svg" aria-hidden="true"><use href="#${team.flag_id}"/></svg>` : (team.flag || '')}</span>
                <span class="group-name">${teamName(team.name)}</span>
                ${statsHtml}
                <span class="group-fav-slot">${favHeart}</span>
            </div>`;
        });
        html += `</div>`;
        const region = grpRegion[g];
        if (region) {
            html += `<div class="group-region group-region-${region.toLowerCase()}">${region} Region</div>`;
        }
        html += `</div>`;
    });

    const groupsEl = document.getElementById('groups');
    groupsEl.innerHTML = html;

    // Beste treere — vis under gruppe-griddet
    let thirdEl = document.getElementById('best-thirds');
    if (!thirdEl) {
        thirdEl = document.createElement('div');
        thirdEl.id = 'best-thirds';
        groupsEl.after(thirdEl);
    }

    if (hasAnyResults && allThirds.length > 0) {
        // Sorter treere: poeng → målforskjell → mål scoret
        allThirds.sort((a, b) => {
            if (b.pts !== a.pts) return b.pts - a.pts;
            if ((b.gf-b.ga) !== (a.gf-a.ga)) return (b.gf-b.ga) - (a.gf-a.ga);
            return b.gf - a.gf;
        });

        const rows = allThirds.map((third, i) => {
            const advancing = i < 4;
            const gd = (third.gf - third.ga > 0 ? '+' : '') + (third.gf - third.ga);
            return `<div class="third-row${advancing ? ' third-advancing' : ''}">
                <span class="third-pos">${i+1}</span>
                <span class="third-flag">${third.flag_id ? `<svg class="flag-svg" aria-hidden="true"><use href="#${third.flag_id}"/></svg>` : (third.flag || '')}</span>
                <span class="third-name">${teamName(third.name)}</span>
                <span class="third-group">Gr. ${third.group}</span>
                <span class="third-stats"><span class="third-gd">${gd}</span><span class="third-pts">${t('third_pts', third.pts)}</span><span class="third-gf">${t('third_goals', third.gf)}</span></span>
            </div>`;
        }).join('');

        thirdEl.innerHTML = `
            <div class="thirds-section">
                <button class="thirds-toggle" onclick="this.parentElement.classList.toggle('open')" aria-expanded="false">
                    <span class="thirds-title">${t('best_thirds')}</span>
                    <i class="bi bi-chevron-down thirds-chevron"></i>
                </button>
                <div class="thirds-body">
                    <div class="thirds-note">${t('thirds_note', allThirds.length)}</div>
                    <div class="thirds-list">${rows}</div>
                </div>
            </div>`;
    } else {
        thirdEl.innerHTML = '';
    }
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function showTab(name, btn) {
    // 'grid' er ikke lenger en egen fane — omdiriger til timeline i vertikal modus
    if (name === 'grid') {
        applyTlMode('vertical');
        name = 'timeline';
    }
    ['timeline','table','groups','bracket','stats','arenas'].forEach(n => {
        const el = document.getElementById('view-'+n);
        if (el) el.classList.toggle('active', n === name);
    });
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    // Oppdater URL-hash ved fanebytte — norsk eller engelsk avhengig av LANG
    const tabHashNo = { timeline: TL_MODE === 'vertical' ? '#rutenett' : '#tidslinje', table: '#kamper',  groups: '#grupper',  arenas: '#arenaer',  stats: '#statistikk', bracket: '#sluttspill' };
    const tabHashEn = { timeline: TL_MODE === 'vertical' ? '#grid'     : '#timeline',  table: '#table',   groups: '#groups',   arenas: '#venues',   stats: '#stats',      bracket: '#bracket' };
    const tabHash   = LANG === 'no' ? tabHashNo : tabHashEn;
    if (tabHash[name]) history.replaceState(null, '', tabHash[name]);
    // Bygg faner ved første besøk
    if (name === 'stats'   && !document.getElementById('stats-built'))   buildStats();
    if (name === 'arenas'  && !document.getElementById('arenas-built'))  buildArenas();
    if (name === 'map'     && !document.getElementById('map-built'))     buildMap();
    if (name === 'bracket' && !document.getElementById('bracket-built')) buildBracket();
    if (name === 'timeline' && TL_MODE === 'horizontal') { buildTimeline(); renderTlToolbar(); }
    if (name === 'timeline' && TL_MODE === 'vertical')   buildVerticalGrid();
}

// ── KO-bracket ────────────────────────────────────────────────────────────────
function renderBracketToolbar() {
    let bar = document.getElementById('bracket-toolbar');
    if (!bar) return;

    const groups = 'ABCDEFGHIJKL'.split('');
    const teams = Object.entries(TEAMS)
        .filter(([, td]) => !td._alias && td.group);
    const favTeams = teams
        .filter(([name]) => name !== 'Norway' && FAVORITE_TEAMS.includes(name))
        .sort((a, b) => a[0].localeCompare(b[0]));
    const otherTeams = teams
        .filter(([name]) => name !== 'Norway' && !FAVORITE_TEAMS.includes(name))
        .sort((a, b) => a[0].localeCompare(b[0]));

    const activeGrp  = ACTIVE_FILTER?.type === 'group' ? ACTIVE_FILTER.value : null;
    const activeTeam = ACTIVE_FILTER?.type === 'team'  ? ACTIVE_FILTER.value : null;

    bar.className = 'tl-toolbar';
    bar.innerHTML = `
        <div class="tl-toolbar-left">
            <div class="tl-filter-wrap">
                <button class="tl-filter-btn${ACTIVE_FILTER ? ' active' : ''}" onclick="toggleBracketFilterMenu()" id="bracket-filter-toggle" aria-expanded="false">
                    <i class="bi bi-funnel"></i>
                    <span>${ACTIVE_FILTER
                        ? (ACTIVE_FILTER.type === 'team'
                            ? `${TEAMS[ACTIVE_FILTER.value]?.flag_id ? `<svg class="flag-svg" aria-hidden="true"><use href="#${TEAMS[ACTIVE_FILTER.value].flag_id}"/></svg>` : (TEAMS[ACTIVE_FILTER.value]?.flag || '')} ${ACTIVE_FILTER.value}`
                            : ACTIVE_FILTER.type === 'favorites'
                            ? `<i class="bi bi-heart-fill" style="margin-right:.3em"></i>${t('favourites')}`
                            : `${t('grp_prefix')}${ACTIVE_FILTER.value}`)
                        : t('filter')}</span>
                </button>
                <div class="tl-filter-menu" id="bracket-filter-menu" style="display:none">
                    <div class="tl-filter-section">Grupper</div>
                    <div class="tl-filter-groups">
                        ${groups.map(g => `<button class="tl-filter-grp${activeGrp === g ? ' selected' : ''}" onclick="setGroupFilter('${g}');closeBracketFilterMenu()">Gr. ${g}</button>`).join('')}
                    </div>
                    <div class="tl-filter-section">Lag</div>
                    <div class="tl-filter-teams">
                        <button class="tl-filter-team${activeTeam === 'Norway' ? ' selected' : ''}" onclick="setTeamFilter('Norway');closeBracketFilterMenu()">${TEAMS['Norway']?.flag_id ? `<svg class="flag-svg" aria-hidden="true"><use href="#${TEAMS['Norway'].flag_id}"/></svg>` : '🇳🇴'} Norway</button>
                        ${favTeams.length > 0 ? `<div class="tl-filter-divider"></div>${FAVORITE_TEAMS.filter(n => n !== 'Norway').length > 0 ? `<button class="tl-filter-team tl-filter-favorites${ACTIVE_FILTER?.type === 'favorites' ? ' selected' : ''}" onclick="setFavoritesFilter();closeBracketFilterMenu()"><i class="bi bi-heart-fill"></i> ${t('fav_count', FAVORITE_TEAMS.filter(n => n !== 'Norway').length)}</button>` : ''}${favTeams.map(([name, td]) => `<button class="tl-filter-team${activeTeam === name ? ' selected' : ''}" onclick="setTeamFilter('${name}');closeBracketFilterMenu()">${td.flag_id ? `<svg class="flag-svg" aria-hidden="true"><use href="#${td.flag_id}"/></svg>` : (td.flag || '')} ${teamName(name)}</button>`).join('')}` : ''}
                        <div class="tl-filter-divider"></div>
                        ${otherTeams.map(([name, td]) => `<button class="tl-filter-team${activeTeam === name ? ' selected' : ''}" onclick="setTeamFilter('${name}');closeBracketFilterMenu()">${td.flag_id ? `<svg class="flag-svg" aria-hidden="true"><use href="#${td.flag_id}"/></svg>` : (td.flag || '')} ${teamName(name)}</button>`).join('')}
                    </div>
                </div>
            </div>
            ${ACTIVE_FILTER ? `<button class="tl-filter-clear-btn" onclick="clearFilter()" aria-label="Fjern filter"><i class="bi bi-x"></i> ${t('reset')}</button>` : ''}
        </div>
        <div class="tl-toolbar-right">
            <button class="tl-highlight-toggle${HIGHLIGHTS_ON ? ' on' : ''}" onclick="toggleHighlights()" title="${HIGHLIGHTS_ON ? t('hide_hl') : t('show_hl')}">
                <i class="bi bi-heart${HIGHLIGHTS_ON ? '-fill' : ''}"></i>
            </button>
        </div>
    `;
}

function toggleBracketFilterMenu() {
    const menu = document.getElementById('bracket-filter-menu');
    const wrap = document.getElementById('bracket-filter-wrap') || menu?.closest('.tl-filter-wrap');
    const btn  = document.getElementById('bracket-filter-toggle');
    if (!menu) return;
    const open = menu.style.display !== 'none';
    menu.style.display = open ? 'none' : 'block';
    btn?.setAttribute('aria-expanded', String(!open));
    if (!open) {
        const handler = (e) => {
            if (wrap && wrap.contains(e.target)) return;
            closeBracketFilterMenu();
            document.removeEventListener('pointerdown', handler, true);
        };
        setTimeout(() => document.addEventListener('pointerdown', handler, true), 0);
    }
}

function closeBracketFilterMenu() {
    const menu = document.getElementById('bracket-filter-menu');
    const btn  = document.getElementById('bracket-filter-toggle');
    if (menu) menu.style.display = 'none';
    btn?.setAttribute('aria-expanded', 'false');
}

function buildBracket() {
    const el = document.getElementById('view-bracket');
    if (!el) return;

    el.innerHTML = '<div id="bracket-toolbar"></div><div id="bracket-built"></div>';
    renderBracketToolbar();

    // ── Layout-konstantar ──────────────────────────────────────────────────────
    const isMobile  = window.innerWidth <= 700;
    const isTiny    = window.innerWidth <= 480;
    // CARD_H: fiks høyde sett via CSS (2 team-rader + header + meta = 68px desktop, 62px tiny)
    const CARD_H    = isTiny ? 62 : 68;
    const GAP       = isTiny ? 8  : 10;   // garantert luft mellom kort
    const TOP_PAD   = isTiny ? 6  : 8;    // luft mellom header og første kort
    const SLOT_H    = CARD_H + GAP;
    const ROUND_W   = isTiny ? 52 : isMobile ? 88 : 110;
    const CONN_W    = isTiny ? 12 : isMobile ? 20 : 32;
    const HEADER_H  = el._bracketHeaderH || 42;

    // Publiser CARD_H som CSS-variabel så .bracket-match-empty kan bruke den
    el.style.setProperty('--bracket-card-h', CARD_H + 'px');

    // ── Kampnummer per halvdel ─────────────────────────────────────────────────
    // Rekkefølge: r32L[i*2] og r32L[i*2+1] er feeders for r16L[i]
    // 89=W74vW77, 90=W73vW75, 91=W76vW78, 92=W79vW80
    // 97=W89vW90, 99=W91vW92  → venstre QF
    const r32L = [74, 77, 73, 75, 76, 78, 79, 80];
    const r16L = [89, 90, 91, 92];
    const qfL  = [97, 99];
    const sfL  = [101];

    // 93=W83vW84, 94=W81vW82, 95=W86vW88, 96=W85vW87
    // 98=W93vW94, 100=W95vW96 → høyre QF
    const sfR  = [102];
    const qfR  = [98, 100];
    const r16R = [93, 94, 95, 96];
    const r32R = [83, 84, 81, 82, 86, 88, 85, 87];

    // Sentrum
    const finNums = [104, 103]; // 104=FIN øverst, 103=3P under

    // ── Y-posisjonar ──────────────────────────────────────────────────────────
    const matchY = {}; // num → y-px

    // Venstre: R32 er grunnlinja (offset med TOP_PAD for luft under header)
    r32L.forEach((num, i) => { matchY[num] = TOP_PAD + i * SLOT_H; });

    // Venstre: sentrering av seinare rundar mellom kjeldekampane
    r16L.forEach((num, i) => {
        matchY[num] = (matchY[r32L[i * 2]] + matchY[r32L[i * 2 + 1]]) / 2;
    });
    qfL.forEach((num, i) => {
        matchY[num] = (matchY[r16L[i * 2]] + matchY[r16L[i * 2 + 1]]) / 2;
    });
    sfL.forEach((num, i) => {
        matchY[num] = (matchY[qfL[i * 2]] + matchY[qfL[i * 2 + 1]]) / 2;
    });

    // Høgre: same y-posisjonar som venstre (speilbilde av slot-oppsettet)
    r32R.forEach((num, i) => { matchY[num] = TOP_PAD + i * SLOT_H; });
    r16R.forEach((num, i) => {
        matchY[num] = (matchY[r32R[i * 2]] + matchY[r32R[i * 2 + 1]]) / 2;
    });
    qfR.forEach((num, i) => {
        matchY[num] = (matchY[r16R[i * 2]] + matchY[r16R[i * 2 + 1]]) / 2;
    });
    sfR.forEach((num, i) => {
        matchY[num] = (matchY[qfR[i * 2]] + matchY[qfR[i * 2 + 1]]) / 2;
    });

    // Sentrum: Finale øverst/sentrert, 3P (bronsefinale) under og dempet
    const containerH = TOP_PAD + 7 * SLOT_H + CARD_H;
    matchY[104] = containerH / 2 - CARD_H / 2 - 4;   // Finale sentrert
    matchY[103] = containerH / 2 + CARD_H / 2 + 12;  // 3P under Finale

    // ── Filter-hjelpedata (eige scope — buildTimeline har sitt eige) ──────────
    const bkActivePaths = ACTIVE_FILTER?.type === 'team'
        ? getTeamBracketPaths(ACTIVE_FILTER.value)
        : ACTIVE_FILTER?.type === 'group'
        ? (() => {
            const combined = new Map();
            Object.entries(TEAMS)
                .filter(([, td]) => !td._alias && td.group === ACTIVE_FILTER.value)
                .forEach(([name]) => getTeamBracketPaths(name).forEach((v, n) => {
                    if (!combined.has(n)) combined.set(n, v);
                }));
            return combined;
        })()
        : ACTIVE_FILTER?.type === 'favorites'
        ? (() => {
            const combined = new Map();
            FAVORITE_TEAMS.forEach(name => {
                getTeamBracketPaths(name).forEach((v, n) => {
                    if (!combined.has(n)) combined.set(n, v);
                });
            });
            return combined;
        })()
        : new Map();

    const activePotentialNums = new Set(
        [...bkActivePaths.keys()].filter(n => n != null).filter(n => {
            const m = MATCHES.find(x => x.num === n);
            if (!m) return true;
            if (ACTIVE_FILTER?.type === 'team') {
                return m.team1 !== ACTIVE_FILTER.value && m.team2 !== ACTIVE_FILTER.value;
            }
            if (ACTIVE_FILTER?.type === 'group') {
                const grpTeams = Object.entries(TEAMS)
                    .filter(([, td]) => !td._alias && td.group === ACTIVE_FILTER.value)
                    .map(([nm]) => nm);
                return !grpTeams.some(nm => m.team1 === nm || m.team2 === nm);
            }
            if (ACTIVE_FILTER?.type === 'favorites') {
                return !FAVORITE_TEAMS.some(name => m.team1 === name || m.team2 === name);
            }
            return true;
        })
    );

    // ── Hjelpefunksjon: bygg matchkart-HTML ───────────────────────────────────
    function matchCard(m) {
        if (!m) return '<div class="bracket-match bracket-match-empty"></div>';

        const idx = MATCHES.indexOf(m);
        const sc  = m.score;
        const st  = STADIUMS[m.v] || {};
        const city = st.city || m.ground || '';

        // Avgjerd kven som vann
        let winner = null, loser = null;
        if (sc?.ft) {
            const [g1, g2] = sc.ft;
            if (g1 !== g2) {
                winner = g1 > g2 ? 'team1' : 'team2';
                loser  = g1 > g2 ? 'team2' : 'team1';
            } else if (sc.p) {
                const [p1, p2] = sc.p;
                winner = p1 > p2 ? 'team1' : 'team2';
                loser  = p1 > p2 ? 'team2' : 'team1';
            }
        }

        const s1 = sc?.ft ? String(sc.ft[0]) : '';
        const s2 = sc?.ft ? String(sc.ft[1]) : '';

        const rawT1 = m.team1 || '';
        const rawT2 = m.team2 || '';
        const isCode1 = rawT1.match(/^[WL]\d+$/) || rawT1.match(/^[123][A-L]/) || rawT1.match(/^3[A-L\/]+$/);
        const isCode2 = rawT2.match(/^[WL]\d+$/) || rawT2.match(/^[123][A-L]/) || rawT2.match(/^3[A-L\/]+$/);

        // Vis FIFA-kode (3 bokstavar) eller kortform av posisjonskoden
        const label1 = isCode1 ? rawT1 : (TEAMS[rawT1]?.fifa_code || rawT1.slice(0, 3).toUpperCase());
        const label2 = isCode2 ? rawT2 : (TEAMS[rawT2]?.fifa_code || rawT2.slice(0, 3).toUpperCase());
        const flag1  = isCode1 ? '' : m.flag1;
        const flag2  = isCode2 ? '' : m.flag2;

        const isNorway    = rawT1 === 'Norway' || rawT2 === 'Norway';
        const isFavMatch  = HIGHLIGHTS_ON && !isNorway &&
            (FAVORITE_TEAMS.includes(rawT1) || FAVORITE_TEAMS.includes(rawT2));
        const isNorwayHl  = HIGHLIGHTS_ON && isNorway;

        // Filter-dimming: dempe kort som ikke er relevante for aktivt filter
        const isFilterActive = !!ACTIVE_FILTER;
        let isDimmed = false;
        if (isFilterActive) {
            if (ACTIVE_FILTER.type === 'team') {
                isDimmed = rawT1 !== ACTIVE_FILTER.value && rawT2 !== ACTIVE_FILTER.value
                    && !activePotentialNums.has(m.num);
            } else if (ACTIVE_FILTER.type === 'group') {
                const grpTeams = Object.entries(TEAMS)
                    .filter(([, td]) => !td._alias && td.group === ACTIVE_FILTER.value)
                    .map(([n]) => n);
                isDimmed = !grpTeams.some(n => rawT1 === n || rawT2 === n)
                    && !activePotentialNums.has(m.num);
            } else if (ACTIVE_FILTER.type === 'favorites') {
                isDimmed = !FAVORITE_TEAMS.some(n => rawT1 === n || rawT2 === n)
                    && !activePotentialNums.has(m.num);
            }
        }

        const cardCls = [
            'bracket-match',
            m.num === 103 ? 'bracket-match-3p'    : '',
            m.num === 104 ? 'bracket-match-fin'    : '',
            isNorwayHl    ? 'bracket-match-norway' : '',
            isFavMatch    ? 'bracket-match-fav'    : '',
            isDimmed      ? 'bracket-match-dimmed' : '',
        ].filter(Boolean).join(' ');

        const t1Cls = ['bracket-team team1',
            winner === 'team1' ? 'bracket-winner' : '',
            loser  === 'team1' ? 'bracket-loser'  : '',
            rawT1 === 'Norway' ? 'bracket-norway'  : '',
        ].filter(Boolean).join(' ');
        const t2Cls = ['bracket-team team2',
            winner === 'team2' ? 'bracket-winner' : '',
            loser  === 'team2' ? 'bracket-loser'  : '',
            rawT2 === 'Norway' ? 'bracket-norway'  : '',
        ].filter(Boolean).join(' ');

        let typeBadge = '';
        if (m.num === 103) typeBadge = '<span class="bracket-type-badge badge-3p">3P</span>';
        if (m.num === 104) typeBadge = '<span class="bracket-type-badge badge-fin">FIN</span>';

        const timeStr = m.t != null ? fmtT(m.t) : '';
        const fullName1 = isCode1 ? rawT1 : rawT1;
        const fullName2 = isCode2 ? rawT2 : rawT2;

        const numStr  = m.num != null ? `#${m.num}` : '';
        const dateStr = m.day && m.date ? `${m.day} ${m.date}` : '';
        // Kort datoformat: "05.07" fra isoDate
        const dateShort = m.isoDate ? m.isoDate.slice(8) + '.' + m.isoDate.slice(5,7) : '';
        // Kun time-del av klokkeslett: "21" fra "21:00"
        const timeShort = timeStr ? timeStr.split(':')[0] : '';

        const headerParts = [numStr, city].filter(Boolean);
        // Full header: #89 · Miami  — skjules på tiny
        // Tiny header: dato · tid   — vises kun på tiny
        const matchHeader = headerParts.length || dateStr
            ? `<div class="bracket-match-header bk-hdr-full">${headerParts.join(' · ')}</div>` +
              `<div class="bracket-match-header bk-hdr-tiny"><span class="bracket-meta-date">${dateShort}</span><span class="bracket-meta-time">${timeShort}</span></div>`
            : '';

        const footerParts = [dateStr, timeStr].filter(Boolean);
        // Full footer: dato · tid   — skjules på tiny
        // Tiny footer: by           — vises kun på tiny
        const footerFull = footerParts.length
            ? `<div class="bracket-meta bk-meta-full"><span class="bracket-meta-date">${dateStr}</span>${timeStr ? `<span class="bracket-meta-time">${timeStr}${nextDayBadge(m.t, m.isoDate)}</span>` : ''}</div>`
            : '';
        const footerTiny = city
            ? `<div class="bracket-meta bk-meta-tiny"><span class="bracket-meta-city">${city}</span></div>`
            : '';

        return `<div class="${cardCls}" onclick="openModal(MATCHES[${idx}])" title="${fullName1} v ${fullName2}${timeStr ? ' · ' + timeStr : ''}${city ? ' · ' + city : ''}">
            ${typeBadge}
            ${matchHeader}
            <div class="${t1Cls}">
                ${flag1 ? `<span class="bracket-flag">${flag1}</span>` : ''}
                <span class="bracket-name">${label1}</span>
                <span class="bracket-flag-code">${label1}</span>
                <span class="bracket-score">${s1}</span>
            </div>
            <div class="${t2Cls}">
                ${flag2 ? `<span class="bracket-flag">${flag2}</span>` : ''}
                <span class="bracket-name">${label2}</span>
                <span class="bracket-flag-code">${label2}</span>
                <span class="bracket-score">${s2}</span>
            </div>
            ${footerFull}${footerTiny}
        </div>`;
    }

    // ── Hjelpefunksjon: bygg ein kolonne med kort ──────────────────────────────
    const matchMap = {};
    MATCHES.forEach(m => { if (m.num != null) matchMap[m.num] = m; });

    function buildCol(label, nums) {
        const cards = nums.map((num, i) => {
            const card = matchCard(matchMap[num]);
            // Beregn gap over dette kortet for å plassere det riktig
            const y = matchY[num];
            const prevY = i === 0 ? 0 : matchY[nums[i-1]] + CARD_H;
            const gap = Math.max(0, y - prevY);
            return `<div class="bracket-match-spacer" style="height:${gap}px"></div>${card}`;
        }).join('');
        return `<div class="bracket-round" style="width:${ROUND_W}px">
            <div class="bracket-round-header">${label}</div>
            <div class="bracket-round-cards">${cards}<div style="height:${Math.max(0, containerH - (matchY[nums[nums.length-1]] + CARD_H))}px"></div></div>
        </div>`;
    }

    // ── SVG-konnektings: venstre side (liner frå høgre kant → venstre kant) ───
    // Y-koordinatar er relative til topp av bracket-round-cards (under header).
    // SVG-en posisjonerast med top=HEADER_H slik at y=0 i SVG = topp av cards.
    function buildConnectorSVG(fromNums, toNums) {
        const svgLines = [];
        const mx = CONN_W / 2;
        toNums.forEach((toNum, i) => {
            const topFrom = fromNums[i * 2];
            const botFrom = fromNums[i * 2 + 1];
            if (topFrom == null || botFrom == null) return;
            const y1   = matchY[topFrom] + CARD_H / 2;
            const y2   = matchY[botFrom] + CARD_H / 2;
            const yMid = matchY[toNum]   + CARD_H / 2;
            svgLines.push(
                `<line x1="0"      y1="${y1}"   x2="${mx}"     y2="${y1}"   class="bc-line"/>`,
                `<line x1="0"      y1="${y2}"   x2="${mx}"     y2="${y2}"   class="bc-line"/>`,
                `<line x1="${mx}"  y1="${y1}"   x2="${mx}"     y2="${y2}"   class="bc-line"/>`,
                `<line x1="${mx}"  y1="${yMid}" x2="${CONN_W}" y2="${yMid}" class="bc-line"/>`
            );
        });
        return `<svg class="bracket-connector-svg" width="${CONN_W}" height="${containerH}" style="overflow:visible;position:absolute;top:${HEADER_H}px;left:0">${svgLines.join('')}</svg>`;
    }

    // ── SVG-konnektings: høgre side (speilbilde) ──────────────────────────────
    function buildConnectorSVGRight(fromNums, toNums) {
        const svgLines = [];
        const mx = CONN_W / 2;
        toNums.forEach((toNum, i) => {
            const topFrom = fromNums[i * 2];
            const botFrom = fromNums[i * 2 + 1];
            if (topFrom == null || botFrom == null) return;
            const y1   = matchY[topFrom] + CARD_H / 2;
            const y2   = matchY[botFrom] + CARD_H / 2;
            const yMid = matchY[toNum]   + CARD_H / 2;
            svgLines.push(
                `<line x1="${CONN_W}" y1="${y1}"   x2="${mx}"    y2="${y1}"   class="bc-line"/>`,
                `<line x1="${CONN_W}" y1="${y2}"   x2="${mx}"    y2="${y2}"   class="bc-line"/>`,
                `<line x1="${mx}"     y1="${y1}"   x2="${mx}"    y2="${y2}"   class="bc-line"/>`,
                `<line x1="${mx}"     y1="${yMid}" x2="0"        y2="${yMid}" class="bc-line"/>`
            );
        });
        return `<svg class="bracket-connector-svg" width="${CONN_W}" height="${containerH}" style="overflow:visible;position:absolute;top:${HEADER_H}px;left:0">${svgLines.join('')}</svg>`;
    }

    // ── Hjelpefunksjon: pakk inn SVG-konnektings ──────────────────────────────
    function connWrap(svg) {
        return `<div class="bracket-conn-wrap" style="width:${CONN_W}px;height:${containerH + HEADER_H}px">${svg}</div>`;
    }

    // ── Bygg venstre halvdel (R32 → SF, venstre → høgre) ─────────────────────
    const leftHalf = [
        buildCol(t('grp_r32'), r32L),
        connWrap(buildConnectorSVG(r32L, r16L)),
        buildCol(t('grp_r16'), r16L),
        connWrap(buildConnectorSVG(r16L, qfL)),
        buildCol(t('grp_qf'), qfL),
        connWrap(buildConnectorSVG(qfL, sfL)),
        buildCol(t('grp_sf'), sfL),
    ].join('');

    // ── Bygg sentrumskolonne (3P + Finale) ────────────────────────────────────
    // Sentrum-konnektings: SF venstre → Finale (venstre inn)
    const centerConnLeft = buildConnectorSVG(sfL, [104]);
    // Sentrum-konnektings: SF høgre → Finale (høgre inn, speilbilde)
    const centerConnRight = buildConnectorSVGRight(sfR, [104]);

    const centerCards = finNums.map((num, i) => {
        const card = matchCard(matchMap[num]);
        const y = matchY[num];
        const prevY = i === 0 ? 0 : matchY[finNums[i-1]] + CARD_H;
        const gap = Math.max(0, y - prevY);
        return `<div class="bracket-match-spacer" style="height:${gap}px"></div>${card}`;
    }).join('');

    const centerCol = `<div class="bracket-round" style="width:${ROUND_W}px">
        <div class="bracket-round-header">${t('grp_fin')}</div>
        <div class="bracket-round-cards">${centerCards}<div style="height:${Math.max(0, containerH - (matchY[finNums[finNums.length-1]] + CARD_H))}px"></div></div>
    </div>`;

    const center = [
        connWrap(centerConnLeft),
        centerCol,
        connWrap(centerConnRight),
    ].join('');

    // ── Bygg høgre halvdel (SF → R32, venstre mot høgre etter sentrum) ────────
    const rightHalf = [
        buildCol(t('grp_sf'), sfR),
        connWrap(buildConnectorSVGRight(qfR, sfR)),
        buildCol(t('grp_qf'), qfR),
        connWrap(buildConnectorSVGRight(r16R, qfR)),
        buildCol(t('grp_r16'), r16R),
        connWrap(buildConnectorSVGRight(r32R, r16R)),
        buildCol(t('grp_r32'), r32R),
    ].join('');

    // ── Sett saman og skriv til DOM ───────────────────────────────────────────
    const builtEl = document.getElementById('bracket-built');
    if (builtEl) {
        builtEl.innerHTML = `<div class="bracket-container">
            <div class="bracket-inner">
                ${leftHalf}
                ${center}
                ${rightHalf}
            </div>
        </div>`;
    }

    // Korriger layout etter rendering — mål faktisk header-høyde og rebuild om nødvendig
    requestAnimationFrame(() => {
        const hdr   = el.querySelector('.bracket-round-header');
        if (!hdr) return;

        const actualHdrH = Math.round(hdr.getBoundingClientRect().height);
        el.style.setProperty('--bracket-header-h', actualHdrH + 'px');

        if (!el._bracketHeaderH) el._bracketHeaderH = 0;
        if (Math.abs(actualHdrH - el._bracketHeaderH) > 2 && actualHdrH > 0) {
            el._bracketHeaderH = actualHdrH;
            buildBracket();
        }
    });
}

// ── Statistikk ────────────────────────────────────────────────────────────────
function buildStats() {
    const el = document.getElementById('view-stats');
    if (!el) return;
    el.innerHTML = '<div id="stats-built"></div>';

    const played = MATCHES.filter(m => m.score?.ft);
    if (played.length === 0) {
        el.innerHTML = `<div id="stats-built"></div><div class="st-empty">${t('st_empty')}</div>`;
        return;
    }

    // ── 1. Norge-statistikk ────────────────────────────────────────────────────
    const norPlayed = played.filter(m => m.team1 === 'Norway' || m.team2 === 'Norway');
    const norStats = norPlayed.reduce((s, m) => {
        const isHome = m.team1 === 'Norway';
        const gf = isHome ? m.score.ft[0] : m.score.ft[1];
        const ga = isHome ? m.score.ft[1] : m.score.ft[0];
        s.gf += gf; s.ga += ga;
        if (gf > ga) s.w++; else if (gf < ga) s.l++; else s.d++;
        return s;
    }, { w:0, d:0, l:0, gf:0, ga:0 });

    // ── 2. Toppscorere ─────────────────────────────────────────────────────────
    // Aggregate goals per scorer (name + team key to distinguish same names)
    const scorerMap = {}; // key = "name|team" → { name, team, flag, goals, penalties, owngoals }
    played.forEach(m => {
        const processGoals = (goals, scoringTeam, concedingTeam) => {
            (goals || []).forEach(g => {
                // Own goals: attribute to scorer but count for OTHER team
                const team = g.owngoal ? concedingTeam : scoringTeam;
                const key = `${g.name}|${team}`;
                if (!scorerMap[key]) {
                    scorerMap[key] = {
                        name: g.name,
                        team,
                        flag: TEAMS[team]?.flag_id ? `<svg class="flag-svg" aria-hidden="true"><use href="#${TEAMS[team].flag_id}"/></svg>` : (TEAMS[team]?.flag || ''),
                        goals: 0,
                        penalties: 0,
                        owngoals: 0
                    };
                }
                scorerMap[key].goals++;
                if (g.penalty) scorerMap[key].penalties++;
                if (g.owngoal) scorerMap[key].owngoals++;
            });
        };
        processGoals(m.score.goals1, m.team1, m.team2);
        processGoals(m.score.goals2, m.team2, m.team1);
    });

    const topScorers = Object.values(scorerMap)
        .sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name))
        .slice(0, 10);

    // Norway scorers for the Norge-kort
    const norScorerMap = {};
    norPlayed.forEach(m => {
        const processNorGoals = (goals, scoringTeam) => {
            if (scoringTeam !== 'Norway') return;
            (goals || []).forEach(g => {
                if (g.owngoal) return; // own goals are by the opponent
                const key = g.name;
                norScorerMap[key] = (norScorerMap[key] || 0) + 1;
            });
        };
        processNorGoals(m.score.goals1, m.team1);
        processNorGoals(m.score.goals2, m.team2);
        // Also count own goals that benefited Norway (scored by opponent)
        const oppGoals = m.team1 === 'Norway' ? m.score.goals2 : m.score.goals1;
        (oppGoals || []).forEach(g => {
            if (g.owngoal) {
                // own goal by opponent counts for Norway
                const key = `${g.name} (${t('own_goal')})`;
                norScorerMap[key] = (norScorerMap[key] || 0) + 1;
            }
        });
    });
    const norTopScorers = Object.entries(norScorerMap)
        .sort((a, b) => b[1] - a[1]);
    const norTopScorerName = norTopScorers[0]?.[0] || null;

    // ── 3. Høyest scorende kamper ──────────────────────────────────────────────
    const byGoals = played
        .map(m => ({ m, total: m.score.ft[0] + m.score.ft[1] }))
        .sort((a, b) => b.total - a.total || a.m.isoDate.localeCompare(b.m.isoDate))
        .slice(0, 5);

    // ── 4. Flest mål scoret (lag) ──────────────────────────────────────────────
    const teamGoals = {};
    played.forEach(m => {
        teamGoals[m.team1] = (teamGoals[m.team1] || 0) + m.score.ft[0];
        teamGoals[m.team2] = (teamGoals[m.team2] || 0) + m.score.ft[1];
    });
    const topTeams = Object.entries(teamGoals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, g]) => ({ name, goals: g, flag: TEAMS[name]?.flag_id ? `<svg class="flag-svg" aria-hidden="true"><use href="#${TEAMS[name].flag_id}"/></svg>` : (TEAMS[name]?.flag || '') }));

    // ── 5. Arenaer ─────────────────────────────────────────────────────────────
    const venueGoals = {};
    played.forEach(m => { venueGoals[m.v] = (venueGoals[m.v] || 0) + m.score.ft[0] + m.score.ft[1]; });
    const topVenues = Object.entries(venueGoals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([code, g]) => ({ code, goals: g, city: STADIUMS[code]?.city || code }));

    // ── 6. Ekstraomganger og straffespill ──────────────────────────────────────
    const etCount = played.filter(m => m.score.et).length;
    const penCount = played.filter(m => m.score.p).length;

    // ── 7. Oversikt ────────────────────────────────────────────────────────────
    const totalGoals = byGoals.reduce((s, g) => s + g.total, 0) +
        played.slice(5).reduce((s, m) => s + m.score.ft[0] + m.score.ft[1], 0);
    // Actually recompute totalGoals properly:
    const totalGoalsAll = played.reduce((s, m) => s + m.score.ft[0] + m.score.ft[1], 0);

    // ── Build HTML ──────────────────────────────────────────────────────────────
    let html = '<div id="stats-built"></div>';

    // 1. Norge-kort
    if (norPlayed.length > 0) {
        const norScorersList = norTopScorers.map(([name, g]) =>
            `<span>${name} (${g})</span>`
        ).join(' · ');

        html += `
        <div class="st-norway">
            <div class="st-card-title" style="text-align:center">🇳🇴 ${t('st_norway', norPlayed.length)}</div>
            <div class="st-norway-header">
                <div>
                    <div class="st-norway-big">${norStats.w}–${norStats.d}–${norStats.l}</div>
                    <div class="st-norway-label">${t('st_wdl')}</div>
                </div>
                <div>
                    <div class="st-norway-big">${norStats.gf} – ${norStats.ga}</div>
                    <div class="st-norway-label">${t('st_goals')}</div>
                </div>
                ${norTopScorerName ? `<div>
                    <div class="st-norway-big">${norTopScorerName}</div>
                    <div class="st-norway-label">${t('st_top')}</div>
                </div>` : ''}
            </div>
            ${norTopScorers.length > 0 ? `<div class="st-norway-scorers">${norScorersList}</div>` : ''}
        </div>
        <div class="st-divider"></div>`;
    }

    html += '<div class="st-grid">';

    // 2. Toppscorere
    if (topScorers.length > 0) {
        html += `
        <div class="st-card">
            <div class="st-card-title">${t('st_topscorers')}</div>
            <div class="st-note" style="padding:.25rem 0 .4rem;border-bottom:1px solid var(--border);margin-bottom:.25rem">${t('scorers_note')}</div>`;
        topScorers.forEach((s, i) => {
            const isNor = s.team === 'Norway';
            const notes = [];
            if (s.penalties > 0) notes.push(`${s.penalties} ${t('pen')}`);
            if (s.owngoals > 0)  notes.push(`${s.owngoals} ${t('own_goal')}`);
            html += `<div class="st-row${isNor ? ' norway-scorer' : ''}">
                <span class="st-rank">${i+1}</span>
                <span class="st-flag">${s.flag}</span>
                <span class="st-name">${s.name}${notes.length ? ` <span class="st-note">(${notes.join(', ')})</span>` : ''}</span>
                <span class="st-team">${s.team}</span>
                <span class="st-val">${s.goals}</span>
            </div>`;
        });
        html += `</div>`;
    }

    // 3. Høyest scorende kamper
    html += `
    <div class="st-card">
        <div class="st-card-title">${t('st_highscoring')}</div>`;
    byGoals.forEach(({ m, total }) => {
        const idx = MATCHES.indexOf(m);
        html += `<div class="st-row" style="cursor:pointer" onclick="openModal(MATCHES[${idx}])">
            <span class="st-name">${m.flag1} ${teamName(m.team1)} v ${teamName(m.team2)} ${m.flag2}</span>
            <span class="st-val">${m.score.ft[0]}–${m.score.ft[1]}</span>
        </div>`;
    });
    html += `</div>`;

    // 4. Flest mål scoret (lag)
    html += `
    <div class="st-card">
        <div class="st-card-title">${t('st_teamgoals')}</div>`;
    topTeams.forEach((tm, i) => {
        html += `<div class="st-row">
            <span class="st-rank">${i+1}</span>
            <span class="st-flag">${tm.flag}</span>
            <span class="st-name">${teamName(tm.name)}</span>
            <span class="st-val">${tm.goals}</span>
        </div>`;
    });
    html += `</div>`;

    // 5. Arenaer
    html += `
    <div class="st-card">
        <div class="st-card-title">${t('st_venues')}</div>`;
    topVenues.forEach((v, i) => {
        html += `<div class="st-row" style="cursor:pointer" onclick="openVenueModal('${v.code}')">
            <span class="st-rank">${i+1}</span>
            <span class="st-name">${v.city}</span>
            <span class="st-team">${v.code}</span>
            <span class="st-val">${v.goals}</span>
        </div>`;
    });
    html += `</div>`;

    // 6. Ekstraomganger og straffespill
    html += `
    <div class="st-card">
        <div class="st-card-title">${t('st_et_pen')}</div>
        <div class="st-row"><span class="st-name">${t('st_et')}</span><span class="st-val">${etCount}</span></div>
        <div class="st-row"><span class="st-name">${t('st_pen')}</span><span class="st-val">${penCount}</span></div>
    </div>`;

    // 7. Oversikt
    html += `
    <div class="st-card">
        <div class="st-card-title">${t('st_overview')}</div>
        <div class="st-row"><span class="st-name">${t('st_played')}</span><span class="st-val">${played.length} / ${MATCHES.length}</span></div>
        <div class="st-row"><span class="st-name">${t('st_total_goals')}</span><span class="st-val">${totalGoalsAll}</span></div>
        <div class="st-row"><span class="st-name">${t('st_avg')}</span><span class="st-val">${(totalGoalsAll / played.length).toFixed(1)}</span></div>
    </div>`;

    html += '</div>'; // .st-grid
    el.innerHTML = html;
}

// ── Arenaer ───────────────────────────────────────────────────────────────────
function buildArenas() {
    const el = document.getElementById('view-arenas');
    if (!el) return;

    const regions = [
        { key: 'Western', label: 'Western Region', tz: 'UTC−7' },
        { key: 'Central', label: 'Central Region', tz: 'UTC−6/−5' },
        { key: 'Eastern', label: 'Eastern Region', tz: 'UTC−4' },
    ];
    const countryFlags = { 'USA': hostCountryFlag('USA'), 'Canada': hostCountryFlag('Canada'), 'Mexico': hostCountryFlag('Mexico') };
    const matchCount = {};
    MATCHES.forEach(m => { matchCount[m.v] = (matchCount[m.v] || 0) + 1; });

    const regionColors = { Western: '#4a9eff', Central: '#ffaa44', Eastern: '#44cc88' };
    const regionGroups = { Western: 'Gr. D, G', Central: 'Gr. A, E, F, J, K, L', Eastern: 'Gr. B, C, H, I' };
    const regionMatchCounts = {};
    Object.entries(STADIUMS).forEach(([code, s]) => {
        if (!regionMatchCounts[s.region]) regionMatchCounts[s.region] = 0;
        regionMatchCounts[s.region] += matchCount[code] || 0;
    });
    const legend = regions.map(r =>
        `<div class="map-legend-item">
            <span class="map-legend-dot" style="background:${regionColors[r.key]}"></span>
            <div class="map-legend-text">
                <span class="map-legend-name">${r.label}</span>
                <span class="map-legend-sub">${regionGroups[r.key]} · ${regionMatchCounts[r.key] || 0} ${t('matches')}</span>
            </div>
        </div>`
    ).join('');

    let html = `<div id="arenas-built"></div>
        <div class="map-container" style="margin-bottom:1.5rem">
            <div class="map-svg-wrap" id="map-svg-wrap"></div>
            <div class="map-sidebar">
                <div class="map-legend">${legend}</div>
                <div class="map-note">${t('map_note')}</div>
            </div>
        </div>`;

    regions.forEach(region => {
        const arenas = Object.entries(STADIUMS)
            .filter(([, s]) => s.region === region.key)
            .sort((a, b) => a[1].city.localeCompare(b[1].city));

        html += `<div class="arenas-region" data-region="${region.key}">
            <div class="arenas-region-title">${region.label} <span class="arenas-tz">${regions.find(r=>r.key===region.key)?.tz||''}</span> <span class="arenas-groups">${regionGroups[region.key]}</span></div>
            <div class="arenas-grid">
            ${arenas.map(([code, s]) => `
                <div class="arena-card" onclick="openVenueModal('${code}')">
                    <div class="arena-card-header">
                        <span class="arena-code v-${code}">${code}</span>
                        <span class="arena-country">${countryFlags[s.country] || ''} ${s.country}</span>
                    </div>
                    <div class="arena-name">${s.name}</div>
                    <div class="arena-city">${s.city}</div>
                    <div class="arena-meta">
                        <span>${s.cap ? s.cap.toLocaleString('no') + ' pl.' : ''}</span>
                        <span>${matchCount[code] || 0} ${t('matches')}</span>
                    </div>
                </div>`).join('')}
            </div>
        </div>`;
    });
    el.innerHTML = html;

    // Bruk inlinede SVG-kart fra #map-svg-source (injisert av build.js)
    const mapSource = document.getElementById('map-svg-source');
    const wrap = document.getElementById('map-svg-wrap');
    if (wrap && mapSource) {
        // Bruk innerHTML i stedet for cloneNode for å unngå dupliserte IDs
        // som kan forårsake problemer i Edge (filter-referanser etc.)
        wrap.innerHTML = mapSource.innerHTML;
        const svgEl = wrap.querySelector('svg');
        if (svgEl) {
            svgEl.removeAttribute('id'); // fjern id="arena-map" fra kopien
        }
        wrap.querySelectorAll('.arena-dot').forEach(dot => {
            const code = dot.dataset.code;
            const cnt = matchCount[code] || 0;
            const circle = dot.querySelector('circle');
            if (circle && cnt > 0) {
                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('x', circle.getAttribute('cx'));
                text.setAttribute('y', parseFloat(circle.getAttribute('cy')) + 3.5);
                text.setAttribute('text-anchor', 'middle');
                text.setAttribute('font-family', 'Space Mono,monospace');
                text.setAttribute('font-size', '8');
                text.setAttribute('fill', 'rgba(0,0,0,.9)');
                text.setAttribute('font-weight', 'bold');
                text.textContent = cnt;
                dot.appendChild(text);
            }
        });
    }
}

// ── Kart ──────────────────────────────────────────────────────────────────────
function buildMap() {
    const el = document.getElementById('view-map');
    if (!el) return;

    const matchCount = {};
    MATCHES.forEach(m => { matchCount[m.v] = (matchCount[m.v] || 0) + 1; });

    // Legg til legend og wrapper
    const regionLabels = { Western: 'Western Region', Central: 'Central Region', Eastern: 'Eastern Region' };
    const regionColors = { Western: '#4a9eff', Central: '#ffaa44', Eastern: '#44cc88' };

    const legend = Object.entries(regionLabels).map(([key, label]) =>
        `<span class="map-legend-item"><span class="map-legend-dot" style="background:${regionColors[key]}"></span>${label}</span>`
    ).join('');

    el.innerHTML = `
        <div id="map-built"></div>
        <div class="map-container">
            <div class="map-legend">${legend}</div>
            <div class="map-svg-wrap" id="map-svg-wrap">
                <img src="map.svg" id="map-svg-img" style="display:none">
            </div>
            <div class="map-note">Klikk på en arena for å se kampene der</div>
        </div>
    `;

    // Hjelpefunksjon: aktiver kart-prikker etter at SVG er i DOM
    function activateMap() {
        const wrap = document.getElementById('map-svg-wrap');
        if (!wrap) return;
        wrap.querySelectorAll('.arena-dot').forEach(dot => {
            const code = dot.dataset.code;
            const cnt = matchCount[code] || 0;
            const circle = dot.querySelector('circle');
            if (circle && cnt > 0) {
                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('x', circle.getAttribute('cx'));
                text.setAttribute('y', parseFloat(circle.getAttribute('cy')) + 3.5);
                text.setAttribute('text-anchor', 'middle');
                text.setAttribute('font-family', 'Space Mono,monospace');
                text.setAttribute('font-size', '8');
                text.setAttribute('fill', 'rgba(0,0,0,.9)');
                text.setAttribute('font-weight', 'bold');
                text.textContent = cnt;
                dot.appendChild(text);
            }
        });
    }

    // Foretrekk inlinert SVG (bygget inn i HTML av build.js, unngår fetch/CORS)
    const inlineSource = document.getElementById('map-svg-source');
    if (inlineSource) {
        const wrap = document.getElementById('map-svg-wrap');
        if (wrap) {
            wrap.innerHTML = inlineSource.innerHTML;
            wrap.querySelector('svg')?.removeAttribute('id');
            activateMap();
        }
        return;
    }

    // Fallback: fetch (fungerer over HTTP, men ikke alltid via file:// på Windows/Edge)
    fetch('map.svg')
        .then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })
        .then(svgText => {
            const wrap = document.getElementById('map-svg-wrap');
            if (!wrap) return;
            wrap.innerHTML = svgText;
            activateMap();
        })
        .catch(() => {
            const wrap = document.getElementById('map-svg-wrap');
            if (wrap) wrap.innerHTML = `<p style="text-align:center;color:var(--muted);padding:2rem">${t('no_map')}</p>`;
        });
}

// ── Hopp til i dag ────────────────────────────────────────────────────────────
function scrollToToday() {
    // Bytt til tidslinje-fanen hvis ikke aktiv
    const tlPanel = document.getElementById('view-timeline');
    if (!tlPanel.classList.contains('active')) {
        const tlBtn = document.querySelector('.tab[onclick*="timeline"]');
        if (tlBtn) showTab('timeline', tlBtn);
    }
    // Finn første rad som tilhører dagens dato eller fremover
    const todayISO = new Date().toISOString().slice(0, 10);
    const tl = document.getElementById('tl');
    if (!tl) return;

    // Finn første .tl-row eller .tl-section som ikke er i en kollapsgruppe
    const rows = tl.querySelectorAll('.tl-row:not(.past), .tl-section, .tl-collapsed-group');
    const firstFuture = rows[0];
    if (firstFuture) {
        firstFuture.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// ── Norges vei ────────────────────────────────────────────────────────────────
function buildNorwaySchedule() {
    const el = document.getElementById('norway-schedule');
    const inner = document.getElementById('norway-schedule-inner');
    if (!el || !inner) return;

    const norMatches = MATCHES.filter(m => m.team1 === 'Norway' || m.team2 === 'Norway');
    if (!norMatches.length) { el.style.display = 'none'; return; }

    const now = Date.now();
    inner.innerHTML = norMatches.map(m => {
        const opp = m.team1 === 'Norway' ? m.team2 : m.team1;
        const oppFlag = m.team1 === 'Norway' ? m.flag2 : m.flag1;
        const sc = scoreStr(m.score);
        const isPast = isMatchPast(m);
        const isLive = !isPast && cestToDate(m.isoDate, m.t).getTime() <= now;
        const st = STADIUMS[m.v] || {};
        const idx = MATCHES.indexOf(m);
        return `<span class="nor-sched-item${isPast?' past':''}${isLive?' live':''}" onclick="openModal(MATCHES[${idx}])" title="${m.day} ${m.date} · ${st.city || m.ground}">
            ${oppFlag} ${opp}
            <span class="nor-sched-score">${sc || fmtT(m.t)}</span>
        </span>`;
    }).join('<span class="nor-sched-sep">·</span>');

    el.style.display = 'block';
    updateHeaderHeight();
}
// Beregn hvilke KO-kamper Norge kan ende opp i basert på gruppe I
// Bracket-logikk: 1I → R32 #77, 2I → R32 #78
function getNorwayPotentialMatches() {
    return getNorwayPotentialMatchesForTeam('Norway');
}

// ── Bracket-analyse ───────────────────────────────────────────────────────────
// getTeamBracketPaths(teamName)
// Returnerer Map<num, { match, via }> der 'via' er en lesbar etikett som
// forklarer hvilken gruppeplassering som fører til denne kampen.
// F.eks. via="1I" for gruppevinner, "2I" for andreplass, "3I" for treerplass.
// Deles videre nedover bracketen som "Via 1I → W77" osv.
function getTeamBracketPaths(teamName) {
    const teamData = TEAMS[teamName];
    if (!teamData?.group) return new Map();

    const grp = teamData.group;

    // ── Sjekk om laget allerede er i KO-runden ────────────────────────────────
    // Finn en spilt KO-kamp der laget deltok
    const koPlayed = MATCHES.filter(m =>
        m.num != null && m.type !== 'g' && m.score?.ft &&
        (m.team1 === teamName || m.team2 === teamName)
    );

    if (koPlayed.length > 0) {
        // Finn siste spilte KO-kamp
        const lastKo = koPlayed[koPlayed.length - 1];
        const [g1, g2] = lastKo.score.ft;
        const winner = g1 > g2 ? lastKo.team1 : g2 > g1 ? lastKo.team2 :
            (lastKo.score.p ? (lastKo.score.p[0] > lastKo.score.p[1] ? lastKo.team1 : lastKo.team2) : null);

        if (winner !== teamName) return new Map(); // Laget er ute

        // Laget vant — finn neste kamp via MATCHES_RAW (har W/L-koder intakt)
        // MATCHES kan ha resolved teamnavn via resolveKOTeams, så vi bruker num-kjeden
        const result = new Map();
        function followBracketKO(startNum, via) {
            // Finn kamp i MATCHES_RAW der W{startNum} er team1 eller team2
            const rawNext = MATCHES_RAW.find(m =>
                m.num != null && (m.team1 === `W${startNum}` || m.team2 === `W${startNum}`)
            );
            if (!rawNext) return;
            // Finn tilsvarende kamp i MATCHES (for oppdatert score/teamnavn)
            const liveNext = MATCHES.find(m => m.num === rawNext.num);
            if (!liveNext || liveNext.score?.ft) return; // allerede spilt
            if (result.has(liveNext.num)) return;
            result.set(liveNext.num, { match: liveNext, via });
            followBracketKO(liveNext.num, via);
        }
        followBracketKO(lastKo.num, teamName);
        return result;
    }

    // ── Ellers: beregn fra gruppeplassering ───────────────────────────────────

    // Standings
    const stMap = {};
    MATCHES.filter(m => m.grp === grp && m.type === 'g').forEach(m => {
        const init = () => ({ pts:0, gf:0, ga:0, played:0, remaining:0 });
        if (!stMap[m.team1]) stMap[m.team1] = init();
        if (!stMap[m.team2]) stMap[m.team2] = init();
        if (m.score?.ft) {
            const [s1, s2] = m.score.ft;
            stMap[m.team1].gf+=s1; stMap[m.team1].ga+=s2; stMap[m.team1].played++;
            stMap[m.team2].gf+=s2; stMap[m.team2].ga+=s1; stMap[m.team2].played++;
            if (s1>s2)      stMap[m.team1].pts+=3;
            else if (s1<s2) stMap[m.team2].pts+=3;
            else { stMap[m.team1].pts++; stMap[m.team2].pts++; }
        } else {
            stMap[m.team1].remaining++;
            stMap[m.team2].remaining++;
        }
    });

    if (!stMap[teamName]) return new Map();
    const myStats = stMap[teamName];
    const allGroupDone = Object.values(stMap).every(s => s.remaining === 0);
    const myMaxPts = myStats.pts + myStats.remaining * 3;

    // Bestem mulige grupplasseringer
    const possiblePositions = new Set();
    if (allGroupDone) {
        const sorted = Object.entries(stMap).sort((a,b) => {
            if (b[1].pts!==a[1].pts) return b[1].pts-a[1].pts;
            if ((b[1].gf-b[1].ga)!==(a[1].gf-a[1].ga)) return (b[1].gf-b[1].ga)-(a[1].gf-a[1].ga);
            return b[1].gf-a[1].gf;
        });
        const finalPos = sorted.findIndex(([n]) => n===teamName)+1;
        if (finalPos===4) return new Map();
        possiblePositions.add(Math.min(finalPos, 3));
    } else {
        // Ingen spilte kamper: alle plasseringer mulige
        if (myStats.played === 0) {
            possiblePositions.add(1);
            possiblePositions.add(2);
            possiblePositions.add(3);
        } else {
            const aboveCount = Object.entries(stMap)
                .filter(([n]) => n!==teamName)
                .filter(([,s]) => s.pts > myMaxPts).length;
            if (aboveCount===0) possiblePositions.add(1);
            if (aboveCount<=1)  possiblePositions.add(2);
            if (aboveCount<=2)  possiblePositions.add(3);
        }
    }
    if (possiblePositions.size===0) return new Map();

    // result: Map<num, { match, via }> — kun kamper med gyldig num (KO-kamper)
    const result = new Map();

    function followBracket(m, via) {
        if (!m || m.num == null) return; // Gruppespill og ukjente kamper har num=null — ignorer
        if (result.has(m.num)) {
            const existing = result.get(m.num);
            if (!existing.via.includes(via)) existing.via += ' / ' + via;
            return;
        }
        result.set(m.num, { match: m, via });
        const winCode = `W${m.num}`;
        const next = MATCHES.find(x => !x.score?.ft && (x.team1===winCode || x.team2===winCode));
        if (next) followBracket(next, via);
    }

    for (const pos of possiblePositions) {
        const posLabel = `${pos}${grp}`;
        if (pos===3) {
            MATCHES.filter(m =>
                m.type==='r32' && !m.score?.ft && (
                    (m.team1.match(/^3[A-L\/]+$/) && m.team1.replace('3','').split('/').includes(grp)) ||
                    (m.team2.match(/^3[A-L\/]+$/) && m.team2.replace('3','').split('/').includes(grp))
                )
            ).forEach(r32 => followBracket(r32, posLabel));
        } else {
            const r32 = MATCHES.find(m =>
                m.type==='r32' && !m.score?.ft &&
                (m.team1===posLabel || m.team2===posLabel)
            );
            if (r32) followBracket(r32, posLabel);
        }
    }

    return result;
}

// Alias — returnerer bare match-objekter, sortert på dato
function getNorwayPotentialMatchesForTeam(teamName) {
    const paths = getTeamBracketPaths(teamName);
    return [...paths.values()]
        .map(({match}) => match)
        .sort((a,b) => a.isoDate<b.isoDate?-1:a.isoDate>b.isoDate?1:(a.t||0)-(b.t||0));
}

// ── Tema ──────────────────────────────────────────────────────────────────────
const themes = ['system','light','dark'];
const icons  = { system:'◐', light:'○', dark:'●' };
let currentTheme = localStorage.getItem('theme') || 'system';

function applyTheme(th) {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', th==='system'?(dark?'dark':'light'):th);
    document.getElementById('theme-icon').textContent = icons[th];
    document.getElementById('theme-label').textContent = th === 'system' ? t('theme_sys') : th === 'light' ? t('theme_day') : t('theme_night');
}
function cycleTheme() {
    currentTheme = themes[(themes.indexOf(currentTheme)+1) % themes.length];
    localStorage.setItem('theme', currentTheme);
    applyTheme(currentTheme);
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (currentTheme === 'system') applyTheme('system');
});
applyTheme(currentTheme);

// ── CRT-modus (easter egg) ────────────────────────────────────────────────────
let crtOn = localStorage.getItem('crtMode') === '1';
if (crtOn) document.body.classList.add('crt-mode');

function toggleCRT() {
    crtOn = !crtOn;
    document.body.classList.toggle('crt-mode', crtOn);
    localStorage.setItem('crtMode', crtOn ? '1' : '0');
}

// ── Init ──────────────────────────────────────────────────────────────────────
MATCHES = buildMatches(MATCHES_RAW, null);
resolveKOTeams(); // Løs W/L-koder basert på eventuelle scores i MATCHES_RAW

// Sett --header-h CSS-variabel slik at tl-axis-wrap sticky top er korrekt
function updateHeaderHeight() {
    const h    = document.querySelector('.site-header')?.offsetHeight || 0;
    const tabs = document.querySelector('.tabs')?.offsetHeight || 0;
    document.documentElement.style.setProperty('--header-h', h + 'px');
    document.documentElement.style.setProperty('--header-tabs-h', (h + tabs) + 'px');
}
updateHeaderHeight();
window.addEventListener('resize', () => {
    updateHeaderHeight();
    buildTimeline();
});
// Oppdater header-høyde etter at alt er rendret (fonter, bilder osv.)
window.addEventListener('load', updateHeaderHeight);

buildTimeline();
// Sett riktig visningsmodus (horisontal/vertikal) fra localStorage
applyTlMode();
initTZ();
initLang();
// Oppdater tab-etiketter ved oppstart slik at de reflekterer valgt språk
(function updateTabLabels() {
    const tabIds   = ['timeline','table','groups','arenas','bracket'];
    const tabIcons = ['bi-bar-chart-steps','bi-list-ul','bi-grid-3x3-gap','bi-geo-alt','bi-diagram-3'];
    const tabKeys  = ['tab_timeline','tab_table','tab_groups','tab_arenas','tab_bracket'];
    tabIds.forEach((id, i) => {
        const btn = document.getElementById('tab-' + id);
        if (btn) btn.innerHTML = `<i class="bi ${tabIcons[i]}"></i> ${t(tabKeys[i])}`;
    });
})();
buildTable();
buildGroups();
updateNorwayBanner();
updateCountdown();
checkLive();
NORWAY_POTENTIAL_MATCHES = new Set(getNorwayPotentialMatches().map(m => m.num));

// Åpne modal hvis URL har hash ved innlasting
requestAnimationFrame(() => requestAnimationFrame(openModalByHash));

// Oppdater hvert sekund
setInterval(() => {
    updateCountdown();
    updateNorwayBanner();
    checkLive();
}, 1000);

if (location.protocol === 'https:' || location.protocol === 'http:') {
    fetchResults();
}
