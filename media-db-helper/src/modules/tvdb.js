'use strict';

// ════════════════════════════════════════════════════════════════════════════
// PART 4 — TVDB
// TVDB-specific: form scraping, TMDB API fetch → TVDB form fill,
// and TVDB-side config panel HTML.
// ════════════════════════════════════════════════════════════════════════════

import {
    urlSeason,
    pget, pset,
    escHtml, gmRequest,
    state,
    configPanel, configOverlay, previewOverlay,
    setConfigStatus, setPreviewStatus,
    showPreview, syncFieldsFromDOM, saveEpisodes,
    buildManualSectionHtml,
} from './core.js';

// ── Small inline reload button style ─────────────────────────────────────────
const RELOAD_BTN_STYLE =
    'border:none;background:transparent;color:#01b4e4;cursor:pointer;' +
    'padding:0 0 0 6px;font-size:11px;vertical-align:middle;line-height:1';

// ── Read the starting episode number directly from the TVDB bulk-add form ─────
export function getFormStartEpisode() {
    const el = document.querySelector('fieldset.noformat input[name="number[]"]');
    if (!el) return 1;
    const v = parseInt(el.value, 10);
    return isNaN(v) ? 1 : v;
}

// ── TVDB-side config panel HTML ───────────────────────────────────────────────
export function buildTvdbPanelHtml() {
    return `
        <h3 style="margin:0 0 14px;color:#01b4e4;font-size:17px">Fetch Episodes (TVDB)</h3>
        <div class="tm-tabs">
            <div class="tm-tab active" data-mode="tmdb">จาก TMDB API</div>
            <div class="tm-tab" data-mode="manual">Manual (ไม่มีใน TMDB)</div>
        </div>

        <!-- จาก TMDB API -->
        <div id="tm-tmdb-section">
            <div class="tm-field">
                <label class="tm-label">TMDB API Key (v3)</label>
                <input id="tm-key" type="password"
                    placeholder="Paste your TMDB v3 API key"
                    value="${escHtml(pget('tmdb_apikey'))}">
            </div>
            <div class="tm-field">
                <label class="tm-label">TMDB Show ID</label>
                <input id="tm-show" type="text"
                    placeholder="e.g. 17454"
                    value="${escHtml(pget('tmdb_id'))}">
            </div>
            <div class="tm-field">
                <label class="tm-label">Season Number</label>
                <input id="tm-season" type="number" value="${urlSeason}" min="1">
            </div>
            <div class="tm-field">
                <label class="tm-label">
                    Language
                    <button type="button" id="tm-lang-reload" style="${RELOAD_BTN_STYLE}"
                        title="โหลดรายการภาษาที่มีในซีรี่นี้">🔄</button>
                </label>
                <div id="tm-lang-wrap">
                    <input id="tm-lang" type="text"
                        value="${escHtml(pget('tmdb_lang', 'en-US'))}"
                        placeholder="en-US / th-TH">
                </div>
                <p class="tm-hint" id="tm-lang-hint">กรอก API Key + Show ID แล้วกด 🔄 เพื่อโหลดรายการภาษา</p>
            </div>
        </div>

        <!-- Manual -->
        <div id="tm-manual-section" style="display:none">
            ${buildManualSectionHtml()}
        </div>

        <div id="tm-config-status" class="tm-status"></div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">
            <button id="tm-cancel" class="tm-btn tm-btn-secondary">Cancel</button>
            <button id="tm-go" class="tm-btn tm-btn-primary">Fetch Episodes</button>
        </div>
    `;
}

// ── Fetch from TMDB API v3 → fill TVDB bulk-add form ─────────────────────────
export async function doFetchFromTmdb() {
    const apiKey = configPanel.querySelector('#tm-key').value.trim();
    const showId = configPanel.querySelector('#tm-show').value.trim();
    const season = configPanel.querySelector('#tm-season').value.trim();
    const lang   = configPanel.querySelector('#tm-lang').value.trim() || 'en-US';

    if (!apiKey || !showId || !season) {
        setConfigStatus('กรุณากรอก API Key, Show ID, และ Season', 'err');
        return;
    }

    pset('tmdb_apikey', apiKey);
    pset('tmdb_id', showId);
    setConfigStatus('Fetching from TMDB…', 'warn');

    let res;
    try {
        res = await gmRequest({
            method: 'GET',
            url: `https://api.themoviedb.org/3/tv/${encodeURIComponent(showId)}/season/${encodeURIComponent(season)}?api_key=${encodeURIComponent(apiKey)}&language=${encodeURIComponent(lang)}`,
        });
    } catch {
        setConfigStatus('Network error.', 'err');
        return;
    }

    if (res.status !== 200) {
        setConfigStatus(`TMDB error: HTTP ${res.status}`, 'err');
        return;
    }

    let data;
    try { data = JSON.parse(res.responseText); }
    catch { setConfigStatus('Failed to parse TMDB response.', 'err'); return; }

    const all = data.episodes;
    if (!all?.length) {
        setConfigStatus('No episodes returned. Check Show ID and season.', 'err');
        return;
    }

    // Start from the episode the TVDB form is already at
    const startEp  = getFormStartEpisode();
    const startIdx = all.findIndex(e => e.episode_number >= startEp);
    if (startIdx === -1) {
        setConfigStatus(`No episode ≥ ${startEp} found.`, 'err');
        return;
    }

    // Take all remaining episodes from the detected start point (no artificial cap).
    // doFillTvdb will add exactly as many rows as needed.
    const mapped = all.slice(startIdx).map(ep => ({
        episode_number: ep.episode_number,
        name:     ep.name     || '',
        overview: ep.overview || '',
        air_date: ep.air_date || '',
        runtime:  ep.runtime  != null ? String(ep.runtime) : '',
    }));

    setConfigStatus('', '');
    configOverlay.classList.remove('active');
    showPreview(
        mapped,
        `TMDB · Show ${showId} · Season ${season} · ตอน ${startEp}–${all[all.length - 1].episode_number} (${mapped.length} ตอน)`
    );
}

// ── Fill TVDB bulk-add form with previewEpisodes ──────────────────────────────
export function doFillTvdb() {
    syncFieldsFromDOM();

    const fieldset = document.querySelector('fieldset.noformat');
    if (!fieldset) {
        setPreviewStatus('Could not find the TVDB bulk-add form.', 'err');
        return;
    }

    const addBtn = fieldset.querySelector('button.multirow-add');
    let rows     = _getRows(fieldset);
    const needed = state.previewEpisodes.length;

    // Click "add row" as many times as needed (generous attempt limit)
    let attempts = 0;
    while (rows.length < needed && addBtn && attempts++ < needed * 2 + 10) {
        addBtn.click();
        rows = _getRows(fieldset);
    }

    state.previewEpisodes.forEach((ep, i) => {
        if (i >= rows.length) return;
        const row = rows[i];
        _setVal(row, 'input[name="number[]"]',     ep.episode_number);
        _setVal(row, 'input[name="name[]"]',        ep.name);
        _setVal(row, 'textarea[name="overview[]"]', ep.overview);
        _setVal(row, 'input[name="date[]"]',         ep.air_date);
        _setVal(row, 'input[name="runtime[]"]',      ep.runtime);
    });

    const filled = Math.min(needed, rows.length);
    saveEpisodes(state.previewEpisodes);
    setPreviewStatus(
        `เติมข้อมูล TVDB สำเร็จ ${filled} ตอน · บันทึกสำหรับใช้ใน TMDB ด้วย`,
        'ok'
    );
    setTimeout(() => {
        previewOverlay.classList.remove('active');
        setPreviewStatus('', '');
    }, 2200);
}

// ── Language fetch: TMDB translations → <select> in the TVDB config panel ────
export function setupTvdbLangFetch() {
    const trigger = () => {
        const key = configPanel.querySelector('#tm-key')?.value.trim();
        const id  = configPanel.querySelector('#tm-show')?.value.trim();
        if (key && id) _fetchTmdbLangs(key, id);
    };
    configPanel.querySelector('#tm-key')?.addEventListener('blur',  trigger);
    configPanel.querySelector('#tm-show')?.addEventListener('blur', trigger);
    configPanel.querySelector('#tm-lang-reload')?.addEventListener('click', trigger);
}

async function _fetchTmdbLangs(apiKey, showId) {
    const wrap = configPanel.querySelector('#tm-lang-wrap');
    const hint = configPanel.querySelector('#tm-lang-hint');
    if (!wrap) return;

    const currentVal = configPanel.querySelector('#tm-lang')?.value || pget('tmdb_lang', 'en-US');
    wrap.innerHTML = '<span style="color:#9ab;font-size:12px">⏳ กำลังโหลดภาษา…</span>';

    try {
        const res = await gmRequest({
            method: 'GET',
            url: `https://api.themoviedb.org/3/tv/${encodeURIComponent(showId)}/translations` +
                 `?api_key=${encodeURIComponent(apiKey)}`,
        });
        if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
        const data  = JSON.parse(res.responseText);
        const langs = (data.translations || []).map(t => {
            const code  = `${t.iso_639_1}-${t.iso_3166_1}`;
            const extra = t.name && t.name !== t.english_name ? ` (${t.name})` : '';
            return { value: code, label: `${code}  —  ${t.english_name}${extra}` };
        });

        if (!langs.length) throw new Error('ไม่พบข้อมูลภาษา');

        const select = document.createElement('select');
        select.id = 'tm-lang';
        let matched = false;
        langs.forEach(({ value, label }) => {
            const opt = new Option(label, value);
            if (value === currentVal) { opt.selected = true; matched = true; }
            select.appendChild(opt);
        });
        if (!matched) select.options[0].selected = true;

        wrap.innerHTML = '';
        wrap.appendChild(select);
        pset('tmdb_lang', select.value);
        select.addEventListener('change', () => pset('tmdb_lang', select.value));
        if (hint) { hint.style.color = ''; hint.textContent = `พบ ${langs.length} ภาษา`; }

    } catch (e) {
        wrap.innerHTML =
            `<input id="tm-lang" type="text"
                value="${escHtml(currentVal)}" placeholder="en-US / th-TH">`;
        if (hint) { hint.style.color = '#f88'; hint.textContent = `โหลดไม่สำเร็จ (${e.message}) — พิมพ์เองได้`; }
    }
}

// ── TVDB form helpers ─────────────────────────────────────────────────────────
function _getRows(fieldset) {
    return Array.from(fieldset.querySelectorAll('.multirow-item'));
}

function _setVal(row, selector, value) {
    const el = row.querySelector(selector);
    if (!el) return;
    el.value = value ?? '';
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
}
