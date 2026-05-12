'use strict';

import './scss/styles.scss';

// ── Core (shared) ─────────────────────────────────────────────────────────────
import {
    isTvdb, isTmdb,
    urlSeason,
    state, MAX_ROWS,
    pget, pset,
    buildManualEpisodes,
    triggerBtn, configOverlay, configPanel, previewOverlay, previewPanel,
    clBtn, clOverlay, clPanel,
    setConfigStatus,
    showPreview, syncFieldsFromDOM,
    updateCrosslinks,
} from './modules/core.js';

// ── TVDB-specific ─────────────────────────────────────────────────────────────
import {
    getFormStartEpisode,
    buildTvdbPanelHtml,
    doFetchFromTmdb,
    doFillTvdb,
} from './modules/tvdb.js';

// ── TMDB-specific ─────────────────────────────────────────────────────────────
import {
    getTmdbNextEpisode,
    buildTmdbPanelHtml,
    doFetchFromTvdb,
    doAddToTmdb,
    doLoadSaved,
} from './modules/tmdb.js';

// ════════════════════════════════════════════════════════════════════════════
// BUILD SITE-SPECIFIC CONFIG PANEL
// ════════════════════════════════════════════════════════════════════════════
configPanel.innerHTML = isTvdb ? buildTvdbPanelHtml() : buildTmdbPanelHtml();

// ── Tab switching ─────────────────────────────────────────────────────────────
configPanel.querySelectorAll('.tm-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        configPanel.querySelectorAll('.tm-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.currentMode = tab.dataset.mode;

        ['#tm-tmdb-section', '#tm-manual-section', '#tm-tvdb-section', '#tm-saved-section']
            .forEach(id => {
                const el = configPanel.querySelector(id);
                if (el) el.style.display = 'none';
            });

        const active = configPanel.querySelector(`#tm-${state.currentMode}-section`);
        if (active) active.style.display = '';

        setConfigStatus('', '');
    });
});

// ════════════════════════════════════════════════════════════════════════════
// MANUAL MODE ORCHESTRATION
// Reads the config form, auto-detects startEp from the page, then calls
// buildManualEpisodes() with (startEp → totalEps) range.
// ════════════════════════════════════════════════════════════════════════════
async function doManual() {
    const showName  = configPanel.querySelector('#tm-m-showname')?.value.trim() || '';
    const season    = configPanel.querySelector('#tm-m-season')?.value.trim() || urlSeason;
    const totalEps  = parseInt(configPanel.querySelector('#tm-m-eps')?.value, 10);
    const prefix    = configPanel.querySelector('#tm-m-prefix')?.value.trim() || 'Episode';
    const startDate = configPanel.querySelector('#tm-m-startdate')?.value;
    const runtime   = configPanel.querySelector('#tm-m-runtime')?.value.trim() || '';

    if (!totalEps || totalEps < 1) { setConfigStatus('กรุณากรอกจำนวนตอน', 'err'); return; }
    if (!startDate)                 { setConfigStatus('กรุณากรอกวันที่ออกอากาศตอนแรก', 'err'); return; }

    // Auto-detect which episode to start from
    let startEpN;
    if (isTvdb) {
        // TVDB: read from the first row of the bulk-add form
        startEpN = getFormStartEpisode();
    } else {
        // TMDB: find max existing episode in Kendo grid + 1
        setConfigStatus('กำลังตรวจสอบตอนที่มีอยู่แล้ว…', 'warn');
        startEpN = await getTmdbNextEpisode();
    }

    if (startEpN > totalEps) {
        setConfigStatus(
            `ตอนที่จะเริ่มเพิ่ม (${startEpN}) เกินจำนวนตอนทั้งหมด (${totalEps}) — ไม่มีตอนที่ต้องเพิ่ม`,
            'err'
        );
        return;
    }

    const newEpsCount = totalEps - startEpN + 1;

    // Persist all fields for next session
    pset('show_name',        showName);
    pset('manual_eps_count', String(totalEps));
    pset('manual_prefix',    prefix);
    pset('manual_startdate', startDate);
    pset('manual_runtime',   runtime);

    const airDays = Array.from(configPanel.querySelectorAll('.tm-day-cb:checked'))
        .map(cb => parseInt(cb.value, 10))
        .sort((a, b) => a - b);
    pset('manual_airdays', JSON.stringify(airDays));

    const episodes = buildManualEpisodes(startEpN, newEpsCount, startDate, airDays, prefix, runtime);
    const capped   = episodes.slice(0, MAX_ROWS);

    const rangeLabel = newEpsCount === 1
        ? `ตอน ${startEpN}`
        : `ตอน ${startEpN}–${totalEps}`;
    const capNote = capped.length < episodes.length
        ? ` (แสดง ${capped.length} จาก ${episodes.length})`
        : '';

    setConfigStatus('', '');
    configOverlay.classList.remove('active');
    showPreview(capped, `Manual · ${showName || '—'} · Season ${season} · ${rangeLabel}${capNote}`);
}

// ════════════════════════════════════════════════════════════════════════════
// EVENT WIRING — Config modal
// ════════════════════════════════════════════════════════════════════════════
triggerBtn.addEventListener('click', () => {
    setConfigStatus('', '');
    configOverlay.classList.add('active');
});

configPanel.querySelector('#tm-cancel').addEventListener('click',
    () => configOverlay.classList.remove('active'));

configOverlay.addEventListener('click',
    e => { if (e.target === configOverlay) configOverlay.classList.remove('active'); });

configPanel.querySelector('#tm-go').addEventListener('click', () => {
    const mode = state.currentMode;
    if      (mode === 'tmdb')   doFetchFromTmdb();   // TVDB side: fetch from TMDB API
    else if (mode === 'tvdb')   doFetchFromTvdb();   // TMDB side: fetch from TVDB API
    else if (mode === 'saved')  doLoadSaved();        // TMDB side: load saved episodes
    else                        doManual();            // both sides: manual schedule
});

// ════════════════════════════════════════════════════════════════════════════
// EVENT WIRING — Preview modal
// ════════════════════════════════════════════════════════════════════════════
previewPanel.querySelector('#tm-preview-back').addEventListener('click', () => {
    previewOverlay.classList.remove('active');
    configOverlay.classList.add('active');
});

previewOverlay.addEventListener('click',
    e => { if (e.target === previewOverlay) previewOverlay.classList.remove('active'); });

previewPanel.querySelector('#tm-preview-confirm').addEventListener('click', () => {
    if (isTvdb) doFillTvdb();
    else        doAddToTmdb();
});

// ════════════════════════════════════════════════════════════════════════════
// EVENT WIRING — Cross-link modal
// ════════════════════════════════════════════════════════════════════════════
clBtn.addEventListener('click', () => {
    updateCrosslinks();
    clOverlay.classList.add('active');
});

clOverlay.addEventListener('click',
    e => { if (e.target === clOverlay) clOverlay.classList.remove('active'); });

clPanel.querySelector('#cl-close').addEventListener('click',
    () => clOverlay.classList.remove('active'));

// Copy-to-clipboard buttons
clPanel.querySelectorAll('.tm-copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const input = clPanel.querySelector('#' + btn.dataset.copy);
        if (!input?.value) return;
        navigator.clipboard.writeText(input.value).then(() => {
            const orig = btn.textContent;
            btn.textContent = '✔';
            setTimeout(() => { btn.textContent = orig; }, 1500);
        });
    });
});

// Save IDs on input and refresh cross-link hrefs
clPanel.querySelector('#cl-tmdb-id').addEventListener('input',
    e => { pset('tmdb_id',        e.target.value.trim()); updateCrosslinks(); });
clPanel.querySelector('#cl-tvdb-id').addEventListener('input',
    e => { pset('tvdb_numeric_id', e.target.value.trim()); updateCrosslinks(); });
clPanel.querySelector('#cl-tvdb-slug').addEventListener('input',
    e => { pset('tvdb_slug',       e.target.value.trim()); updateCrosslinks(); });

// ════════════════════════════════════════════════════════════════════════════
// MOUNT ALL UI TO THE PAGE
// ════════════════════════════════════════════════════════════════════════════
document.body.appendChild(triggerBtn);
document.body.appendChild(configOverlay);
document.body.appendChild(previewOverlay);
document.body.appendChild(clBtn);
document.body.appendChild(clOverlay);
