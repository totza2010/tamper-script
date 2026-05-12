'use strict';

// ════════════════════════════════════════════════════════════════════════════
// PART 3 — TMDB
// TMDB-specific: Kendo DataSource interaction, TVDB API fetch → TMDB add,
// saved-episodes loader, and TMDB-side config panel HTML.
// ════════════════════════════════════════════════════════════════════════════

import {
    urlSeason, tmdbIdFromUrl,
    pget, pset,
    escHtml, gmRequest, sleep,
    normDate, episodeStatusParts,
    state,
    configPanel, configOverlay, previewPanel, previewOverlay,
    setConfigStatus, setPreviewStatus,
    showPreview, syncFieldsFromDOM, saveEpisodes, getSavedEpisodes,
    buildManualSectionHtml,
} from './core.js';

// ── Internal: get loaded Kendo DataSource (waits for data if empty) ───────────
async function _getKendoDS() {
    const jq = (typeof unsafeWindow !== 'undefined' ? unsafeWindow.jQuery : null)
            || window.jQuery;
    if (!jq) return null;
    const grid = jq('#grid').data('kendoGrid');
    if (!grid) return null;
    const ds = grid.dataSource;
    if (!ds.data().length) {
        await new Promise(resolve => {
            ds.one('change', resolve);
            ds.one('error',  resolve);
            setTimeout(resolve, 5000);
            ds.read();
        });
    }
    return ds;
}

// ── Returns a Map<episodeNumber, {name, air_date, runtime}> from the grid ─────
export async function getTmdbExistingMap() {
    try {
        const ds = await _getKendoDS();
        if (!ds) return new Map();
        const map = new Map();
        const items = ds.data();
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const n = parseInt(item.episode_number, 10);
            if (!isNaN(n)) {
                map.set(n, {
                    name:    item.name     || '',
                    air_date:item.air_date  || '',
                    runtime: item.runtime  != null ? String(item.runtime) : '',
                });
            }
        }
        return map;
    } catch { return new Map(); }
}

// ── Returns max existing episode + 1 (used by doManual to auto-detect start) ──
export async function getTmdbNextEpisode() {
    const map = await getTmdbExistingMap();
    if (!map.size) return 1;
    return Math.max(...map.keys()) + 1;
}

// ── TMDB-side config panel HTML ───────────────────────────────────────────────
export function buildTmdbPanelHtml() {
    const saved      = getSavedEpisodes();
    const savedLabel = saved
        ? `${saved.length} ตอน (บันทึกไว้)`
        : 'ยังไม่มีข้อมูลที่บันทึกไว้';

    return `
        <h3 style="margin:0 0 14px;color:#01d277;font-size:17px">Bulk Add Episodes (TMDB)</h3>
        <p style="margin:0 0 14px;font-size:12px;color:#567">
            Series ID: <b style="color:#01d277">${tmdbIdFromUrl}</b>
            &nbsp;·&nbsp;
            Season: <b style="color:#01d277">${urlSeason}</b>
        </p>
        <div class="tm-tabs">
            <div class="tm-tab active" data-mode="manual">Manual</div>
            <div class="tm-tab" data-mode="tvdb">จาก TVDB API</div>
            <div class="tm-tab" data-mode="saved">Saved Episodes</div>
        </div>

        <!-- Manual -->
        <div id="tm-manual-section">
            ${buildManualSectionHtml()}
        </div>

        <!-- จาก TVDB API -->
        <div id="tm-tvdb-section" style="display:none">
            <div class="tm-field">
                <label class="tm-label">TVDB API Key</label>
                <input id="tm-tvdb-key" type="password"
                    placeholder="ดูได้ที่ thetvdb.com/api-information"
                    value="${escHtml(pget('tvdb_apikey'))}">
                <p class="tm-hint">สมัครฟรีที่ thetvdb.com → My Account → API Keys</p>
            </div>
            <div class="tm-field">
                <label class="tm-label">TVDB Series ID (ตัวเลข)</label>
                <input id="tm-tvdb-series-id" type="text"
                    placeholder="e.g. 72449"
                    value="${escHtml(pget('tvdb_numeric_id'))}">
            </div>
            <div class="tm-field">
                <label class="tm-label">Season Number</label>
                <input id="tm-tvdb-season" type="number" value="${urlSeason}" min="1">
            </div>
            <div class="tm-field">
                <label class="tm-label">Language</label>
                <input id="tm-tvdb-lang" type="text"
                    value="tha" placeholder="eng / tha / jpn / zho">
                <p class="tm-hint">ใช้รหัส ISO 639-3 เช่น eng, tha, jpn</p>
            </div>
        </div>

        <!-- Saved Episodes -->
        <div id="tm-saved-section" style="display:none">
            <div style="background:#161626;border:1px solid #2a2a45;border-radius:6px;
                        padding:16px;text-align:center">
                <div style="font-size:28px;margin-bottom:8px">💾</div>
                <div style="font-size:14px;color:#eee;margin-bottom:4px">${savedLabel}</div>
                ${saved
                    ? `<div style="font-size:12px;color:#567">ซีรี่: ${escHtml(pget('show_name') || '—')}</div>`
                    : `<div style="font-size:12px;color:#445;margin-top:8px">
                           สร้างตอนใน TVDB ก่อน แล้วกลับมากด Saved Episodes ที่นี่
                       </div>`
                }
            </div>
        </div>

        <div id="tm-config-status" class="tm-status"></div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">
            <button id="tm-cancel" class="tm-btn tm-btn-secondary">Cancel</button>
            <button id="tm-go" class="tm-btn tm-btn-tmdb">▶ Preview Episodes</button>
        </div>
    `;
}

// ── Fetch from TVDB API v4 → preview for adding to TMDB ──────────────────────
export async function doFetchFromTvdb() {
    const apiKey   = configPanel.querySelector('#tm-tvdb-key')?.value.trim();
    const seriesId = configPanel.querySelector('#tm-tvdb-series-id')?.value.trim();
    const season   = parseInt(configPanel.querySelector('#tm-tvdb-season')?.value, 10);
    const lang     = configPanel.querySelector('#tm-tvdb-lang')?.value.trim() || 'eng';

    if (!apiKey)   { setConfigStatus('กรุณากรอก TVDB API Key', 'err'); return; }
    if (!seriesId) { setConfigStatus('กรุณากรอก TVDB Series ID (ตัวเลข)', 'err'); return; }
    if (!season)   { setConfigStatus('กรุณากรอก Season Number', 'err'); return; }

    pset('tvdb_apikey',     apiKey);
    pset('tvdb_numeric_id', seriesId);
    setConfigStatus('กำลัง Login TVDB API…', 'warn');

    // Step 1: Authenticate → bearer token
    let token;
    try {
        const loginRes = await gmRequest({
            method:  'POST',
            url:     'https://api4.thetvdb.com/v4/login',
            headers: { 'Content-Type': 'application/json' },
            data:    JSON.stringify({ apikey: apiKey }),
        });
        if (loginRes.status !== 200) {
            setConfigStatus(`TVDB login failed: HTTP ${loginRes.status} — ตรวจสอบ API Key`, 'err');
            return;
        }
        const loginData = JSON.parse(loginRes.responseText);
        token = loginData.data?.token;
        if (!token) { setConfigStatus('TVDB login failed: ไม่ได้รับ token', 'err'); return; }
    } catch (e) {
        setConfigStatus('TVDB login error: ' + e.message, 'err');
        return;
    }

    setConfigStatus(`กำลังดึง Season ${season} จาก TVDB…`, 'warn');

    // Step 2: Paginate through episodes
    let allEps = [];
    let page   = 0;
    try {
        while (true) {
            const res = await gmRequest({
                method:  'GET',
                url:     `https://api4.thetvdb.com/v4/series/${encodeURIComponent(seriesId)}/episodes/official?season=${season}&page=${page}`,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept-Language': lang,
                },
            });
            if (res.status !== 200) {
                setConfigStatus(`TVDB API error: HTTP ${res.status}`, 'err');
                return;
            }
            const body = JSON.parse(res.responseText);
            const eps  = body.data?.episodes ?? [];
            allEps = allEps.concat(eps);
            if (!body.links?.next || eps.length === 0) break;
            if (++page > 20) break; // safety cap
        }
    } catch (e) {
        setConfigStatus('TVDB fetch error: ' + e.message, 'err');
        return;
    }

    const seasonEps = allEps
        .filter(ep => ep.seasonNumber === season)
        .sort((a, b) => a.number - b.number);

    if (!seasonEps.length) {
        setConfigStatus(`ไม่พบตอนใน Season ${season} (TVDB Series ${seriesId})`, 'err');
        return;
    }

    // Step 3: Check what's already in TMDB to mark duplicates in preview
    setConfigStatus('กำลังตรวจสอบตอนที่มีอยู่ใน TMDB…', 'warn');
    const existingMap = await getTmdbExistingMap();

    const mapped = seasonEps.map(ep => {
        const epNum   = ep.number;
        const name    = ep.name     || '';
        const airDate = ep.aired    || '';
        const runtime = ep.runtime  != null ? String(ep.runtime) : '';
        const existing = existingMap.get(epNum);

        // _exists: episode number already in TMDB
        // _diff:   exists but has different data from TVDB (potential update)
        let _exists = false, _diff = false;
        if (existing) {
            _exists = true;
            _diff = (airDate && existing.air_date && normDate(airDate) !== normDate(existing.air_date))
                 || (runtime && existing.runtime  && runtime !== existing.runtime);
        }

        return { episode_number: epNum, name, overview: ep.overview || '', air_date: airDate, runtime, _exists, _diff };
    });

    const parts = episodeStatusParts(mapped);
    setConfigStatus('', '');
    configOverlay.classList.remove('active');
    showPreview(mapped, `TVDB API · Series ${seriesId} · Season ${season} · ${parts.join(' · ')}`);
}

// ── Add episodes to TMDB via the page's own Kendo DataSource ─────────────────
// Uses unsafeWindow.jQuery so requests go through the page's own auth stack
// (bypasses AWS WAF and avoids any CSRF/cookie issues).
export async function doAddToTmdb() {
    syncFieldsFromDOM();

    const confirmBtn = previewPanel.querySelector('#tm-preview-confirm');
    const backBtn    = previewPanel.querySelector('#tm-preview-back');
    confirmBtn.disabled = backBtn.disabled = true;

    const jq = (typeof unsafeWindow !== 'undefined' ? unsafeWindow.jQuery : null)
            || window.jQuery;
    if (!jq) {
        setPreviewStatus('ไม่พบ jQuery ในหน้า TMDB — กรุณา reload', 'err');
        confirmBtn.disabled = backBtn.disabled = false;
        return;
    }

    const grid = jq('#grid').data('kendoGrid');
    if (!grid) {
        setPreviewStatus('ไม่พบ Kendo Grid — กรุณา reload หน้า', 'err');
        confirmBtn.disabled = backBtn.disabled = false;
        return;
    }

    const ds = grid.dataSource;

    // Use _exists flags set during preview (already checked against live grid).
    // Episodes marked _exists=true are skipped; _diff episodes are skipped for now
    // (user can edit them manually or clear the flag by editing the field).
    const hasPreviewFlags = state.previewEpisodes.some(ep => ep._exists !== undefined);

    let toAdd, skipped;
    if (hasPreviewFlags) {
        // Fast path: use pre-computed flags from doFetchFromTvdb / doLoadSaved
        toAdd   = state.previewEpisodes.filter(ep => !ep._exists);
        skipped = state.previewEpisodes.length - toAdd.length;
    } else {
        // Fallback: re-read DataSource (doManual path, no pre-flags)
        setPreviewStatus('กำลังตรวจสอบตอนที่มีอยู่แล้ว…', 'warn');
        if (!ds.data().length) {
            await new Promise(resolve => {
                ds.one('change', resolve);
                ds.one('error',  resolve);
                setTimeout(resolve, 8000);
                ds.read();
            });
        }
        const existingNums = new Set(
            Array.from(ds.data()).map(item => parseInt(item.episode_number, 10))
        );
        toAdd   = state.previewEpisodes.filter(ep => !existingNums.has(parseInt(ep.episode_number, 10)));
        skipped = state.previewEpisodes.length - toAdd.length;
    }

    if (!toAdd.length) {
        setPreviewStatus(`ทุกตอนมีอยู่ใน TMDB แล้ว (${skipped} ตอน) — ไม่มีอะไรเพิ่ม`, 'ok');
        confirmBtn.disabled = backBtn.disabled = false;
        return;
    }

    if (skipped > 0) {
        setPreviewStatus(`ข้าม ${skipped} ตอนที่มีอยู่แล้ว · กำลังเพิ่ม ${toAdd.length} ตอนใหม่…`, 'warn');
        await sleep(800);
    }

    let success = 0, fail = 0;

    for (const ep of toAdd) {
        setPreviewStatus(
            `กำลังเพิ่มตอนที่ ${ep.episode_number}… (${success + fail + 1}/${toAdd.length})`,
            'warn'
        );

        const ok = await new Promise(resolve => {
            let done = false;
            const finish = v => { if (!done) { done = true; resolve(v); } };

            ds.one('sync',  () => finish(true));
            ds.one('error', () => finish(false));
            setTimeout(() => finish(false), 15000);

            ds.add({
                episode_number: parseInt(ep.episode_number, 10) || 1,
                name:     ep.name     || '',
                overview: ep.overview || '',
                air_date: ep.air_date || '',
                runtime:  ep.runtime ? parseInt(ep.runtime, 10) : '',
            });
            ds.sync();
        });

        ok ? success++ : fail++;
        await sleep(400);
    }

    saveEpisodes(state.previewEpisodes);

    const skipNote = skipped > 0 ? ` · ข้าม ${skipped} ตอนที่มีอยู่แล้ว` : '';
    setPreviewStatus(
        fail === 0
            ? `✔ เพิ่ม ${success} ตอนลง TMDB สำเร็จ${skipNote}`
            : `⚠ สำเร็จ ${success} · ล้มเหลว ${fail} ตอน${skipNote}`,
        fail === 0 ? 'ok' : 'warn'
    );
    confirmBtn.disabled = backBtn.disabled = false;

    // Refresh grid so the new rows appear immediately
    if (fail === 0) setTimeout(() => ds.read(), 600);
}

// ── Load previously saved episodes (created on TVDB side) ────────────────────
export async function doLoadSaved() {
    const saved = getSavedEpisodes();
    if (!saved || !saved.length) {
        setConfigStatus('ยังไม่มีตอนที่บันทึกไว้ กรุณาสร้างตอนใน TVDB ก่อน', 'err');
        return;
    }

    setConfigStatus('กำลังตรวจสอบตอนที่มีอยู่ใน TMDB…', 'warn');
    const existingMap = await getTmdbExistingMap();

    const marked = saved.map(ep => {
        const existing = existingMap.get(parseInt(ep.episode_number, 10));
        if (!existing) return { ...ep, _exists: false, _diff: false };
        const _diff = (ep.air_date && existing.air_date && normDate(ep.air_date) !== normDate(existing.air_date))
                   || (ep.runtime  && existing.runtime  && ep.runtime  !== existing.runtime);
        return { ...ep, _exists: true, _diff };
    });

    const parts = episodeStatusParts(marked);
    setConfigStatus('', '');
    configOverlay.classList.remove('active');
    showPreview(marked, `Saved · ${pget('show_name') || '—'} · Season ${urlSeason} · ${parts.join(' · ')}`);
}
