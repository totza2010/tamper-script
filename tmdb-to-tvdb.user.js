// ==UserScript==
// @name         TMDB ↔ TVDB Episode Filler
// @namespace    https://tampermonkey.net/
// @version      3.7
// @description  Bulk add/sync episodes on TVDB and TMDB. Fetch from TMDB or TVDB API. Manual schedule. Cross-site sync. ID cross-linking.
// @author       You
// @match        https://www.thetvdb.com/series/*/seasons/official/*/bulkadd
// @match        https://www.themoviedb.org/tv/*/season/*/edit*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      api.themoviedb.org
// @connect      www.themoviedb.org
// @connect      api4.thetvdb.com
// ==/UserScript==

(function () {
    'use strict';

    const MAX_ROWS = 25;

    // ── Site detection ───────────────────────────────────────────────────────
    const isTvdb = location.hostname.includes('thetvdb.com');
    const isTmdb = location.hostname.includes('themoviedb.org');

    // ── URL parsing ──────────────────────────────────────────────────────────
    let urlSeason = '1';
    let tvdbSlug  = '';
    let tmdbIdFromUrl = '';

    if (isTvdb) {
        const m = location.pathname.match(/\/series\/([^/]+)\/seasons\/official\/(\d+)\/bulkadd/);
        if (m) { tvdbSlug = m[1]; urlSeason = m[2]; }
    }
    if (isTmdb) {
        const m = location.pathname.match(/\/tv\/(\d+)\/season\/(\d+)\/edit/);
        if (m) { tmdbIdFromUrl = m[1]; urlSeason = m[2]; }
        // Seed stored TMDB ID from URL
        if (tmdbIdFromUrl) GM_setValue('tmdb_id', tmdbIdFromUrl);
    }
    if (isTvdb && tvdbSlug) GM_setValue('tvdb_slug', tvdbSlug);

    // ── State ────────────────────────────────────────────────────────────────
    let previewEpisodes = [];
    let tmdbSyncConfig  = null; // used on TVDB side to sync → TMDB via GM_xmlhttpRequest
    let currentMode     = isTmdb ? 'manual' : 'tmdb';

    // ── Persisted values ─────────────────────────────────────────────────────
    function pget(k, d = '') { return GM_getValue(k, d); }
    function pset(k, v) { GM_setValue(k, v); }
    function getSavedEpisodes() {
        try { return JSON.parse(pget('saved_episodes', 'null')); } catch { return null; }
    }
    function saveEpisodes(eps) { pset('saved_episodes', JSON.stringify(eps)); }

    // ── Helpers ──────────────────────────────────────────────────────────────
    function getFormStartEpisode() {
        const el = document.querySelector('fieldset.noformat input[name="number[]"]');
        if (!el) return 1;
        const v = parseInt(el.value, 10);
        return isNaN(v) ? 1 : v;
    }

    function toDateStr(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function escHtml(s) {
        return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    function gmRequest(opts) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({ ...opts, onload: resolve, onerror: () => reject(new Error('network')), ontimeout: () => reject(new Error('timeout')) });
        });
    }

    // ── Styles ───────────────────────────────────────────────────────────────
    const style = document.createElement('style');
    style.textContent = `
        .tm-overlay {
            display: none; position: fixed; inset: 0;
            background: rgba(0,0,0,0.75); z-index: 10000;
            justify-content: center; align-items: center;
        }
        .tm-overlay.active { display: flex; }
        .tm-panel {
            background: #1a1a2e; color: #e0e0e0;
            border-radius: 10px; box-shadow: 0 8px 32px rgba(0,0,0,0.7);
            font-family: sans-serif; overflow: hidden;
        }
        .tm-panel input, .tm-panel textarea, .tm-panel select {
            width: 100%; padding: 7px 9px; box-sizing: border-box;
            background: #2a2a3e; border: 1px solid #555; color: #eee;
            border-radius: 4px; font-size: 13px;
        }
        .tm-panel input:focus, .tm-panel textarea:focus { border-color: #01b4e4; outline: none; }
        .tm-label { display: block; margin-bottom: 4px; font-size: 12px; color: #9ab; }
        .tm-field { margin-bottom: 12px; }
        .tm-hint { margin: 4px 0 0; font-size: 11px; color: #566; }
        .tm-btn {
            padding: 8px 18px; border: none; border-radius: 4px;
            cursor: pointer; font-size: 13px; font-weight: bold; transition: opacity .15s;
        }
        .tm-btn:disabled { opacity: 0.45; cursor: default; }
        .tm-btn-primary   { background: #01b4e4; color: #fff; }
        .tm-btn-primary:not(:disabled):hover   { background: #02c8ff; }
        .tm-btn-secondary { background: #3a3a55; color: #ccc; }
        .tm-btn-secondary:not(:disabled):hover { background: #4a4a6a; }
        .tm-btn-success   { background: #1a8a3a; color: #fff; }
        .tm-btn-success:not(:disabled):hover   { background: #22aa48; }
        .tm-btn-warn      { background: #7a5a00; color: #ffe; }
        .tm-btn-warn:not(:disabled):hover      { background: #9a7200; }
        .tm-btn-tmdb      { background: #032541; color: #01d277; border: 1px solid #01d277; }
        .tm-btn-tmdb:not(:disabled):hover      { background: #01d27722; }
        .tm-status {
            display: none; padding: 8px 10px; border-radius: 4px;
            font-size: 13px; margin-bottom: 12px;
        }
        .tm-tabs { display:flex; margin-bottom:16px; border-bottom:2px solid #2a2a45; }
        .tm-tab {
            padding: 8px 16px; cursor: pointer; font-size: 13px; font-weight: bold;
            color: #778; border-bottom: 2px solid transparent; margin-bottom: -2px;
            user-select: none;
        }
        .tm-tab:hover { color: #aac; }
        .tm-tab.active { color: #01b4e4; border-bottom-color: #01b4e4; }
        .tm-divider { border: none; border-top: 1px solid #2a2a45; margin: 14px 0; }
        .tm-section-title { font-size: 11px; color: #567; text-transform: uppercase; letter-spacing: .06em; margin: 0 0 10px; }
        .tm-days { display:flex; gap:5px; flex-wrap:wrap; margin-top:4px; }
        .tm-day-label {
            display:flex; align-items:center; gap:4px;
            background:#2a2a3e; border:1px solid #444; border-radius:4px;
            padding:4px 9px; font-size:12px; cursor:pointer;
        }
        .tm-day-label:has(input:checked) { border-color:#01b4e4; background:#1a2a3e; color:#01b4e4; }
        .tm-day-label input { width:auto; margin:0; }
        .tm-crosslink-box {
            background: #161626; border: 1px solid #2a2a45; border-radius: 6px;
            padding: 12px 14px; margin-top: 4px;
        }
        .tm-crosslink-row { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
        .tm-crosslink-row:last-child { margin-bottom:0; }
        .tm-crosslink-row .tm-label { margin:0; width:110px; flex-shrink:0; font-size:11px; }
        .tm-crosslink-row input { flex:1; font-size:12px; padding:5px 7px; }
        .tm-copy-btn {
            padding: 4px 8px; font-size: 11px; border:1px solid #444;
            border-radius:3px; background:#2a2a3e; color:#9ab; cursor:pointer; white-space:nowrap;
        }
        .tm-copy-btn:hover { background:#3a3a55; }
        .tm-link-btn {
            display: inline-block; font-size: 11px; color: #01b4e4;
            text-decoration: none; padding: 3px 0; white-space: nowrap;
        }
        .tm-link-btn:hover { text-decoration: underline; }
        /* Preview table */
        .tm-preview-table { width:100%; border-collapse:collapse; font-size:12px; }
        .tm-preview-table th {
            background:#252540; color:#9ab; font-weight:600;
            padding:7px 8px; text-align:left; position:sticky; top:0;
        }
        .tm-preview-table td { padding:5px 8px; border-bottom:1px solid #2a2a45; vertical-align:middle; }
        .tm-preview-table tr:hover td { background:#22223a; }
        .tm-preview-table input, .tm-preview-table textarea {
            background:#2a2a3e; border:1px solid #444; color:#eee;
            border-radius:3px; padding:3px 5px; font-size:12px;
            width:100%; box-sizing:border-box;
        }
        .tm-preview-table textarea { resize:vertical; min-height:44px; }
        .tm-move-btn {
            background:#3a3a55; color:#aaa; border:none;
            border-radius:3px; cursor:pointer; padding:2px 6px; font-size:13px;
        }
        .tm-move-btn:hover { background:#5a5a7a; color:#fff; }
        .tm-move-btn:disabled { opacity:0.3; cursor:default; }
        .ep-num-cell { text-align:center; color:#01b4e4; font-weight:bold; }
    `;
    document.head.appendChild(style);

    // ── Floating trigger button ──────────────────────────────────────────────
    const triggerBtn = document.createElement('button');
    triggerBtn.className = `tm-btn ${isTmdb ? 'tm-btn-tmdb' : 'tm-btn-primary'}`;
    triggerBtn.textContent = isTmdb ? '▶ Bulk Add Episodes' : '▶ Fetch from TMDB';
    triggerBtn.style.cssText = 'position:fixed;top:80px;right:20px;z-index:9999;box-shadow:0 2px 10px rgba(0,0,0,0.4);font-size:14px;';
    document.body.appendChild(triggerBtn);

    // ════════════════════════════════════════════════════════════════════════
    // CONFIG MODAL
    // ════════════════════════════════════════════════════════════════════════
    const configOverlay = document.createElement('div');
    configOverlay.className = 'tm-overlay';

    const configPanel = document.createElement('div');
    configPanel.className = 'tm-panel';
    configPanel.style.cssText = 'width:440px;max-width:95vw;padding:26px 24px;max-height:90vh;overflow-y:auto;';

    // ── Restore persisted manual-mode values ─────────────────────────────────
    const savedAirDays   = (() => { try { return JSON.parse(pget('manual_airdays', '[]')); } catch { return []; } })();
    const savedStartDate = pget('manual_startdate', new Date().toISOString().split('T')[0]);

    function dc(v) { return savedAirDays.includes(v) ? 'checked' : ''; } // day-checked helper

    // Shared manual fields HTML (used in both TVDB and TMDB modals)
    const manualFieldsHtml = `
        <div class="tm-field">
            <label class="tm-label">ชื่อซีรี่</label>
            <input id="tm-m-showname" type="text" placeholder="e.g. มาตาลดา" value="${escHtml(pget('show_name'))}">
        </div>
        <div class="tm-field">
            <label class="tm-label">Season Number</label>
            <input id="tm-m-season" type="number" value="${urlSeason}" min="1">
        </div>
        <div class="tm-field">
            <label class="tm-label">จำนวนตอนทั้งหมดในซีซัน
                <span style="color:#567;font-size:10px"> (ระบบจะเพิ่มเฉพาะตอนที่ยังไม่มีอัตโนมัติ)</span>
            </label>
            <input id="tm-m-eps" type="number" value="${escHtml(pget('manual_eps_count', '13'))}" min="1">
        </div>
        <div class="tm-field">
            <label class="tm-label">คำนำหน้าชื่อตอน</label>
            <input id="tm-m-prefix" type="text" value="${escHtml(pget('manual_prefix', 'Episode'))}" placeholder="Episode, EP, ตอนที่">
        </div>
        <hr class="tm-divider">
        <p class="tm-section-title">ตารางออกอากาศ</p>
        <div class="tm-field">
            <label class="tm-label">วันที่ออกอากาศ <b>ตอนที่ 1</b>
                <span style="color:#567;font-size:10px"> (ระบบจะคำนวนวันของตอนถัดไปให้อัตโนมัติ)</span>
            </label>
            <input id="tm-m-startdate" type="date" value="${escHtml(savedStartDate)}">
        </div>
        <div class="tm-field">
            <label class="tm-label">วันออกอากาศ (เลือกได้หลายวัน)</label>
            <div class="tm-days">
                <label class="tm-day-label"><input type="checkbox" class="tm-day-cb" value="0" ${dc(0)}> Sun</label>
                <label class="tm-day-label"><input type="checkbox" class="tm-day-cb" value="1" ${dc(1)}> Mon</label>
                <label class="tm-day-label"><input type="checkbox" class="tm-day-cb" value="2" ${dc(2)}> Tue</label>
                <label class="tm-day-label"><input type="checkbox" class="tm-day-cb" value="3" ${dc(3)}> Wed</label>
                <label class="tm-day-label"><input type="checkbox" class="tm-day-cb" value="4" ${dc(4)}> Thu</label>
                <label class="tm-day-label"><input type="checkbox" class="tm-day-cb" value="5" ${dc(5)}> Fri</label>
                <label class="tm-day-label"><input type="checkbox" class="tm-day-cb" value="6" ${dc(6)}> Sat</label>
            </div>
            <p class="tm-hint">ไม่เลือกเลย = ห่างกัน 7 วัน</p>
        </div>
        <div class="tm-field">
            <label class="tm-label">Runtime (นาที, ไม่บังคับ)</label>
            <input id="tm-m-runtime" type="number" value="${escHtml(pget('manual_runtime', ''))}" min="0" placeholder="45">
        </div>
    `;

    // Cross-link HTML is now a separate floating modal — see below

    if (isTvdb) {
        configPanel.innerHTML = `
            <h3 style="margin:0 0 14px;color:#01b4e4;font-size:17px">Fetch Episodes (TVDB)</h3>
            <div class="tm-tabs">
                <div class="tm-tab active" data-mode="tmdb">จาก TMDB API</div>
                <div class="tm-tab" data-mode="manual">Manual (ไม่มีใน TMDB)</div>
            </div>

            <!-- TMDB API section -->
            <div id="tm-tmdb-section">
                <div class="tm-field">
                    <label class="tm-label">TMDB API Key (v3)</label>
                    <input id="tm-key" type="password" placeholder="Paste your TMDB v3 API key" value="${escHtml(pget('tmdb_apikey'))}">
                </div>
                <div class="tm-field">
                    <label class="tm-label">TMDB Show ID</label>
                    <input id="tm-show" type="text" placeholder="e.g. 17454" value="${escHtml(pget('tmdb_id'))}">
                </div>
                <div class="tm-field">
                    <label class="tm-label">Season Number</label>
                    <input id="tm-season" type="number" value="${urlSeason}" min="1">
                </div>
                <div class="tm-field">
                    <label class="tm-label">Language</label>
                    <input id="tm-lang" type="text" value="en-US" placeholder="en-US / th-TH">
                </div>
            </div>

            <!-- Manual section -->
            <div id="tm-manual-section" style="display:none">
                <div class="tm-field">
                    <label class="tm-label">TMDB Series ID <span style="color:#567">(สำหรับ Sync ตอนไปยัง TMDB)</span></label>
                    <input id="tm-m-tmdbid" type="text" placeholder="e.g. 321137" value="${escHtml(pget('tmdb_id'))}">
                    <p class="tm-hint">ดูได้จาก URL: themoviedb.org/tv/<b>321137</b>/...</p>
                </div>
                ${manualFieldsHtml}
            </div>

            <div id="tm-config-status" class="tm-status"></div>
            <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">
                <button id="tm-cancel" class="tm-btn tm-btn-secondary">Cancel</button>
                <button id="tm-go" class="tm-btn tm-btn-primary">Fetch Episodes</button>
            </div>
        `;
    } else {
        // TMDB edit page
        const saved = getSavedEpisodes();
        const savedLabel = saved ? `${saved.length} ตอน (บันทึกไว้)` : 'ยังไม่มีข้อมูลที่บันทึกไว้';
        configPanel.innerHTML = `
            <h3 style="margin:0 0 14px;color:#01d277;font-size:17px">Bulk Add Episodes (TMDB)</h3>
            <p style="margin:0 0 14px;font-size:12px;color:#567">
                Series ID: <b style="color:#01d277">${tmdbIdFromUrl}</b> &nbsp;·&nbsp; Season: <b style="color:#01d277">${urlSeason}</b>
            </p>
            <div class="tm-tabs">
                <div class="tm-tab active" data-mode="manual">Manual</div>
                <div class="tm-tab" data-mode="tvdb">จาก TVDB API</div>
                <div class="tm-tab" data-mode="saved">Saved Episodes</div>
            </div>

            <!-- Manual section -->
            <div id="tm-manual-section">
                ${manualFieldsHtml}
            </div>

            <!-- TVDB API section -->
            <div id="tm-tvdb-section" style="display:none">
                <div class="tm-field">
                    <label class="tm-label">TVDB API Key</label>
                    <input id="tm-tvdb-key" type="password" placeholder="ดูได้ที่ thetvdb.com/api-information" value="${escHtml(pget('tvdb_apikey'))}">
                    <p class="tm-hint">สมัครฟรีได้ที่ thetvdb.com → My Account → API Keys</p>
                </div>
                <div class="tm-field">
                    <label class="tm-label">TVDB Series ID (ตัวเลข)</label>
                    <input id="tm-tvdb-series-id" type="text" placeholder="e.g. 72449" value="${escHtml(pget('tvdb_numeric_id'))}">
                    <p class="tm-hint">ดูได้จาก URL: thetvdb.com/series/slug/seasons/... → กด Edit → ดูตัวเลข ID</p>
                </div>
                <div class="tm-field">
                    <label class="tm-label">Season Number</label>
                    <input id="tm-tvdb-season" type="number" value="${urlSeason}" min="1">
                </div>
                <div class="tm-field">
                    <label class="tm-label">Language</label>
                    <input id="tm-tvdb-lang" type="text" value="tha" placeholder="eng / tha / jpn / zho">
                    <p class="tm-hint">ใช้รหัส ISO 639-3 เช่น eng, tha, jpn</p>
                </div>
            </div>

            <!-- Saved episodes section -->
            <div id="tm-saved-section" style="display:none">
                <div style="background:#161626;border:1px solid #2a2a45;border-radius:6px;padding:16px;text-align:center">
                    <div style="font-size:28px;margin-bottom:8px">💾</div>
                    <div style="font-size:14px;color:#eee;margin-bottom:4px">${savedLabel}</div>
                    ${saved ? `<div style="font-size:12px;color:#567">ซีรี่: ${escHtml(pget('show_name') || '—')}</div>` : ''}
                    ${saved ? `<div style="font-size:11px;color:#445;margin-top:6px">สร้างครั้งล่าสุดใน session ที่ผ่านมา</div>` : ''}
                    ${!saved ? `<div style="font-size:12px;color:#445;margin-top:8px">สร้างตอนใน TVDB ก่อน แล้วกลับมากด Saved Episodes ที่นี่</div>` : ''}
                </div>
            </div>

            <div id="tm-config-status" class="tm-status"></div>
            <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">
                <button id="tm-cancel" class="tm-btn tm-btn-secondary">Cancel</button>
                <button id="tm-go" class="tm-btn tm-btn-tmdb">▶ Preview Episodes</button>
            </div>
        `;
    }

    configOverlay.appendChild(configPanel);
    document.body.appendChild(configOverlay);

    // ── Tab switching ────────────────────────────────────────────────────────
    configPanel.querySelectorAll('.tm-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            configPanel.querySelectorAll('.tm-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentMode = tab.dataset.mode;
            ['#tm-tmdb-section','#tm-manual-section','#tm-tvdb-section','#tm-saved-section'].forEach(id => {
                const el = configPanel.querySelector(id);
                if (el) el.style.display = 'none';
            });
            const active = configPanel.querySelector(`#tm-${currentMode}-section`);
            if (active) active.style.display = '';
            setConfigStatus('', '');
        });
    });

    // ════════════════════════════════════════════════════════════════════════
    // CROSS-LINK MODAL (separate floating button + panel)
    // ════════════════════════════════════════════════════════════════════════
    const clBtn = document.createElement('button');
    clBtn.textContent = '🔗 Cross-link';
    clBtn.style.cssText = `
        position:fixed;top:124px;right:20px;z-index:9999;
        padding:6px 12px;border:none;border-radius:4px;cursor:pointer;
        font-size:12px;font-weight:bold;background:#252540;color:#9ab;
        box-shadow:0 2px 8px rgba(0,0,0,0.4);
    `;
    document.body.appendChild(clBtn);

    const clOverlay = document.createElement('div');
    clOverlay.className = 'tm-overlay';

    const clPanel = document.createElement('div');
    clPanel.className = 'tm-panel';
    clPanel.style.cssText = 'width:400px;max-width:94vw;padding:22px 20px;';
    clPanel.innerHTML = `
        <h3 style="margin:0 0 14px;color:#9ab;font-size:15px">🔗 Cross-link IDs</h3>
        <p style="margin:0 0 14px;font-size:12px;color:#567">
            บันทึก ID ของทั้งสองเว็บเพื่อเชื่อมซีรี่กัน
        </p>
        <div class="tm-crosslink-box">
            <div class="tm-crosslink-row">
                <span class="tm-label">TMDB Series ID</span>
                <input id="cl-tmdb-id" type="text" placeholder="e.g. 321137" value="${escHtml(pget('tmdb_id'))}">
                <button class="tm-copy-btn" data-copy="cl-tmdb-id">Copy</button>
            </div>
            <div class="tm-crosslink-row">
                <span class="tm-label">TVDB Numeric ID</span>
                <input id="cl-tvdb-id" type="text" placeholder="e.g. 477376" value="${escHtml(pget('tvdb_numeric_id'))}">
                <button class="tm-copy-btn" data-copy="cl-tvdb-id">Copy</button>
            </div>
            <div class="tm-crosslink-row">
                <span class="tm-label">TVDB Slug</span>
                <input id="cl-tvdb-slug" type="text" placeholder="e.g. ban-nang-ram" value="${escHtml(pget('tvdb_slug'))}">
                <button class="tm-copy-btn" data-copy="cl-tvdb-slug">Copy</button>
            </div>
        </div>
        <div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:10px;font-size:12px">
            <a id="cl-link-tvdb-edit" class="tm-link-btn" href="#" target="_blank">→ เพิ่ม TMDB ID ใน TVDB</a>
            <a id="cl-link-tmdb-ext"  class="tm-link-btn" href="#" target="_blank">→ เพิ่ม TVDB ID ใน TMDB</a>
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:16px">
            <button id="cl-close" class="tm-btn tm-btn-secondary">Close</button>
        </div>
    `;
    clOverlay.appendChild(clPanel);
    document.body.appendChild(clOverlay);

    clBtn.addEventListener('click', () => {
        updateCrosslinks();
        clOverlay.classList.add('active');
    });
    clOverlay.addEventListener('click', e => { if (e.target === clOverlay) clOverlay.classList.remove('active'); });
    clPanel.querySelector('#cl-close').addEventListener('click', () => clOverlay.classList.remove('active'));

    // Copy buttons
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

    // Save on input
    clPanel.querySelector('#cl-tmdb-id').addEventListener('input', e => { pset('tmdb_id', e.target.value.trim()); updateCrosslinks(); });
    clPanel.querySelector('#cl-tvdb-id').addEventListener('input', e => { pset('tvdb_numeric_id', e.target.value.trim()); updateCrosslinks(); });
    clPanel.querySelector('#cl-tvdb-slug').addEventListener('input', e => { pset('tvdb_slug', e.target.value.trim()); updateCrosslinks(); });

    function updateCrosslinks() {
        const tid   = pget('tmdb_id');
        const tSlug = pget('tvdb_slug');
        const tvdbEditLink = clPanel.querySelector('#cl-link-tvdb-edit');
        const tmdbExtLink  = clPanel.querySelector('#cl-link-tmdb-ext');
        if (tvdbEditLink) {
            tvdbEditLink.href = tSlug ? `https://www.thetvdb.com/series/${tSlug}/edit` : '#';
            tvdbEditLink.style.opacity = tSlug ? '1' : '0.4';
        }
        if (tmdbExtLink) {
            tmdbExtLink.href = tid ? `https://www.themoviedb.org/tv/${tid}/edit?active_nav_item=external_ids` : '#';
            tmdbExtLink.style.opacity = tid ? '1' : '0.4';
        }
        // Sync TMDB ID field in TVDB manual section if visible
        const manualTmdbField = configPanel.querySelector('#tm-m-tmdbid');
        if (manualTmdbField && tid) manualTmdbField.value = tid;
    }

    // ════════════════════════════════════════════════════════════════════════
    // PREVIEW MODAL
    // ════════════════════════════════════════════════════════════════════════
    const previewOverlay = document.createElement('div');
    previewOverlay.className = 'tm-overlay';

    const previewPanel = document.createElement('div');
    previewPanel.className = 'tm-panel';
    previewPanel.style.cssText = 'width:92vw;max-width:1100px;max-height:90vh;display:flex;flex-direction:column;';
    previewPanel.innerHTML = `
        <div style="padding:18px 20px 14px;border-bottom:1px solid #2a2a45;flex-shrink:0">
            <h3 id="tm-preview-title" style="margin:0;font-size:17px"></h3>
            <p id="tm-preview-subtitle" style="margin:6px 0 0;font-size:12px;color:#88a"></p>
        </div>
        <div style="overflow-y:auto;flex:1;padding:0 0 4px">
            <table class="tm-preview-table">
                <thead><tr>
                    <th style="width:36px">#</th>
                    <th style="width:34px">Ep</th>
                    <th style="width:200px">Name</th>
                    <th>Overview</th>
                    <th style="width:114px">Air Date</th>
                    <th style="width:70px">Runtime</th>
                    <th style="width:52px">Move</th>
                </tr></thead>
                <tbody id="tm-preview-body"></tbody>
            </table>
        </div>
        <div id="tm-preview-status" class="tm-status" style="margin:10px 16px 0;"></div>
        <div style="padding:14px 16px;border-top:1px solid #2a2a45;display:flex;gap:10px;align-items:center;flex-shrink:0">
            <button id="tm-preview-back" class="tm-btn tm-btn-secondary">← Back</button>
            <div style="flex:1"></div>
            <button id="tm-sync-tmdb" class="tm-btn tm-btn-warn" style="display:none">↑ Sync to TMDB</button>
            <button id="tm-preview-confirm" class="tm-btn tm-btn-success">✔ Confirm</button>
        </div>
    `;
    previewOverlay.appendChild(previewPanel);
    document.body.appendChild(previewOverlay);

    // Update title/confirm label per site
    previewPanel.querySelector('#tm-preview-title').textContent = isTvdb
        ? 'Preview & Confirm Episodes'
        : 'Preview & Add to TMDB';
    previewPanel.querySelector('#tm-preview-title').style.color = isTvdb ? '#01b4e4' : '#01d277';
    previewPanel.querySelector('#tm-preview-confirm').textContent = isTvdb
        ? '✔ Fill TVDB Form'
        : '✔ Add to TMDB';
    if (isTmdb) previewPanel.querySelector('#tm-preview-confirm').className = 'tm-btn tm-btn-tmdb';

    // ── Event wiring ─────────────────────────────────────────────────────────
    triggerBtn.addEventListener('click', () => {
        setConfigStatus('', '');
        configOverlay.classList.add('active');
    });

    configPanel.querySelector('#tm-cancel').addEventListener('click', () => configOverlay.classList.remove('active'));
    configOverlay.addEventListener('click', e => { if (e.target === configOverlay) configOverlay.classList.remove('active'); });

    configPanel.querySelector('#tm-go').addEventListener('click', () => {
        if (currentMode === 'tmdb')    doFetchFromTmdb();
        else if (currentMode === 'tvdb')  doFetchFromTvdb();
        else if (currentMode === 'saved') doLoadSaved();
        else doManual();
    });

    previewPanel.querySelector('#tm-preview-back').addEventListener('click', () => {
        previewOverlay.classList.remove('active');
        configOverlay.classList.add('active');
    });
    previewOverlay.addEventListener('click', e => { if (e.target === previewOverlay) previewOverlay.classList.remove('active'); });

    previewPanel.querySelector('#tm-preview-confirm').addEventListener('click', () => {
        if (isTvdb) doFillTvdb();
        else doAddToTmdb();
    });

    previewPanel.querySelector('#tm-sync-tmdb').addEventListener('click', doSyncToTmdb);

    // ── Status helpers ────────────────────────────────────────────────────────
    function setConfigStatus(msg, type) {
        const el = configPanel.querySelector('#tm-config-status');
        if (!msg) { el.style.display = 'none'; return; }
        el.style.display = 'block';
        el.textContent = msg;
        el.style.background = type === 'ok' ? '#1a3a1a' : type === 'err' ? '#3a1a1a' : '#2e2a00';
        el.style.color = type === 'ok' ? '#6f6' : type === 'err' ? '#f66' : '#ffb';
    }

    function setPreviewStatus(msg, type) {
        const el = previewPanel.querySelector('#tm-preview-status');
        if (!msg) { el.style.display = 'none'; return; }
        el.style.display = 'block';
        el.textContent = msg;
        el.style.background = type === 'ok' ? '#1a3a1a' : type === 'err' ? '#3a1a1a' : '#2e2a00';
        el.style.color = type === 'ok' ? '#6f6' : type === 'err' ? '#f66' : '#ffb';
    }

    // ════════════════════════════════════════════════════════════════════════
    // DATA SOURCES
    // ════════════════════════════════════════════════════════════════════════

    // ── Load saved episodes from GM storage ──────────────────────────────────
    function doLoadSaved() {
        const saved = getSavedEpisodes();
        if (!saved || !saved.length) {
            setConfigStatus('ยังไม่มีตอนที่บันทึกไว้ กรุณาสร้างตอนใน TVDB ก่อน', 'err');
            return;
        }
        tmdbSyncConfig = null;
        setConfigStatus('', '');
        configOverlay.classList.remove('active');
        showPreview(saved.slice(0, MAX_ROWS), null, saved.length, `Saved · ${pget('show_name') || '—'} · Season ${urlSeason}`);
    }

    // ── Auto-detect next episode number on TMDB side (via Kendo DataSource) ──
    async function getTmdbNextEpisode() {
        try {
            const jq = (typeof unsafeWindow !== 'undefined' ? unsafeWindow.jQuery : null) || window.jQuery;
            if (!jq) return 1;
            const grid = jq('#grid').data('kendoGrid');
            if (!grid) return 1;
            const ds = grid.dataSource;
            if (!ds.data().length) {
                await new Promise(resolve => {
                    ds.one('change', resolve);
                    ds.one('error', resolve);
                    setTimeout(resolve, 5000);
                    ds.read();
                });
            }
            const items = ds.data();
            if (!items.length) return 1;
            let maxEp = 0;
            for (let i = 0; i < items.length; i++) {
                const n = parseInt(items[i].episode_number, 10);
                if (!isNaN(n) && n > maxEp) maxEp = n;
            }
            return maxEp + 1;
        } catch { return 1; }
    }

    // ── Manual schedule generation ───────────────────────────────────────────
    async function doManual() {
        const showName  = configPanel.querySelector('#tm-m-showname')?.value.trim() || '';
        const tmdbId    = isTvdb ? (configPanel.querySelector('#tm-m-tmdbid')?.value.trim() || '') : tmdbIdFromUrl;
        const season    = configPanel.querySelector('#tm-m-season')?.value.trim() || urlSeason;
        const totalEps  = parseInt(configPanel.querySelector('#tm-m-eps')?.value, 10);
        const prefix    = configPanel.querySelector('#tm-m-prefix')?.value.trim() || 'Episode';
        const startDate = configPanel.querySelector('#tm-m-startdate')?.value;
        const runtime   = configPanel.querySelector('#tm-m-runtime')?.value.trim() || '';

        if (!totalEps || totalEps < 1) { setConfigStatus('กรุณากรอกจำนวนตอน', 'err'); return; }
        if (!startDate)                 { setConfigStatus('กรุณากรอกวันที่ออกอากาศตอนแรก', 'err'); return; }

        // ── Auto-detect start episode number from the page ───────────────────
        let startEpN;
        if (isTvdb) {
            startEpN = getFormStartEpisode();
        } else {
            // TMDB side: find max existing episode + 1 via Kendo DataSource
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

        const newEpsCount = totalEps - startEpN + 1; // episodes that still need to be added

        // Persist all manual fields so they survive between sessions
        pset('show_name',        showName);
        pset('manual_eps_count', String(totalEps));
        pset('manual_prefix',    prefix);
        pset('manual_startdate', startDate);
        pset('manual_runtime',   runtime);
        if (tmdbId) pset('tmdb_id', tmdbId);

        tmdbSyncConfig = (isTvdb && tmdbId) ? { seriesId: tmdbId, season, seriesName: showName } : null;

        const airDays = Array.from(configPanel.querySelectorAll('.tm-day-cb:checked'))
            .map(cb => parseInt(cb.value, 10)).sort((a, b) => a - b);
        pset('manual_airdays', JSON.stringify(airDays));

        const episodes = buildManualEpisodes(startEpN, newEpsCount, startDate, airDays, prefix, runtime);
        const capped   = episodes.slice(0, MAX_ROWS);

        const rangeLabel = newEpsCount === 1
            ? `ตอน ${startEpN}`
            : `ตอน ${startEpN}–${totalEps}`;
        const capNote = capped.length < episodes.length
            ? ` (แสดง ${capped.length} จาก ${episodes.length})` : '';

        setConfigStatus('', '');
        configOverlay.classList.remove('active');
        showPreview(
            capped, startEpN, totalEps,
            `Manual · ${showName || '—'} · Season ${season} · ${rangeLabel}${capNote}`
        );
    }

    // ── Fetch from TMDB API (TVDB side only) ─────────────────────────────────
    function doFetchFromTmdb() {
        const apiKey = configPanel.querySelector('#tm-key').value.trim();
        const showId = configPanel.querySelector('#tm-show').value.trim();
        const season = configPanel.querySelector('#tm-season').value.trim();
        const lang   = configPanel.querySelector('#tm-lang').value.trim() || 'en-US';

        if (!apiKey || !showId || !season) { setConfigStatus('กรุณากรอก API Key, Show ID, และ Season', 'err'); return; }

        pset('tmdb_apikey', apiKey);
        pset('tmdb_id', showId);
        tmdbSyncConfig = null;
        setConfigStatus('Fetching from TMDB…', 'warn');

        GM_xmlhttpRequest({
            method: 'GET',
            url: `https://api.themoviedb.org/3/tv/${encodeURIComponent(showId)}/season/${encodeURIComponent(season)}?api_key=${encodeURIComponent(apiKey)}&language=${encodeURIComponent(lang)}`,
            onload(res) {
                if (res.status !== 200) { setConfigStatus(`TMDB error: HTTP ${res.status}`, 'err'); return; }
                let data;
                try { data = JSON.parse(res.responseText); }
                catch { setConfigStatus('Failed to parse TMDB response.', 'err'); return; }

                const all = data.episodes;
                if (!all?.length) { setConfigStatus('No episodes returned. Check Show ID and season.', 'err'); return; }

                const startEp  = getFormStartEpisode();
                const startIdx = all.findIndex(e => e.episode_number >= startEp);
                if (startIdx === -1) { setConfigStatus(`No episode ≥ ${startEp} found.`, 'err'); return; }

                const mapped = all.slice(startIdx, startIdx + MAX_ROWS).map(ep => ({
                    episode_number: ep.episode_number,
                    name:     ep.name     || '',
                    overview: ep.overview || '',
                    air_date: ep.air_date || '',
                    runtime:  ep.runtime != null ? String(ep.runtime) : '',
                }));

                setConfigStatus('', '');
                configOverlay.classList.remove('active');
                showPreview(mapped, startEp, all.length, `TMDB · Show ${showId} · Season ${season} · ${mapped.length}/${all.length} ตอน`);
            },
            onerror() { setConfigStatus('Network error.', 'err'); }
        });
    }

    // ── Fetch from TVDB API v4 (TMDB side only) ──────────────────────────────
    async function doFetchFromTvdb() {
        const apiKey   = configPanel.querySelector('#tm-tvdb-key')?.value.trim();
        const seriesId = configPanel.querySelector('#tm-tvdb-series-id')?.value.trim();
        const season   = parseInt(configPanel.querySelector('#tm-tvdb-season')?.value, 10);
        const lang     = configPanel.querySelector('#tm-tvdb-lang')?.value.trim() || 'eng';

        if (!apiKey)   { setConfigStatus('กรุณากรอก TVDB API Key', 'err'); return; }
        if (!seriesId) { setConfigStatus('กรุณากรอก TVDB Series ID (ตัวเลข)', 'err'); return; }
        if (!season)   { setConfigStatus('กรุณากรอก Season Number', 'err'); return; }

        pset('tvdb_apikey', apiKey);
        pset('tvdb_numeric_id', seriesId);
        setConfigStatus('กำลัง Login TVDB API…', 'warn');

        // Step 1: Authenticate → bearer token
        let token;
        try {
            const loginRes = await gmRequest({
                method: 'POST',
                url: 'https://api4.thetvdb.com/v4/login',
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify({ apikey: apiKey }),
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

        // Step 2: Fetch episodes — paginate until no more pages or season exhausted
        let allEps = [];
        let page   = 0;
        try {
            while (true) {
                const res = await gmRequest({
                    method: 'GET',
                    url: `https://api4.thetvdb.com/v4/series/${encodeURIComponent(seriesId)}/episodes/official?season=${season}&page=${page}`,
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

                // Stop when next page link is absent or empty result
                if (!body.links?.next || eps.length === 0) break;
                if (++page > 20) break; // safety cap
            }
        } catch (e) {
            setConfigStatus('TVDB fetch error: ' + e.message, 'err');
            return;
        }

        // Filter to requested season (in case API returned mix) and sort by episode number
        const seasonEps = allEps
            .filter(ep => ep.seasonNumber === season)
            .sort((a, b) => a.number - b.number);

        if (!seasonEps.length) {
            setConfigStatus(`ไม่พบตอนใน Season ${season} (TVDB Series ${seriesId})`, 'err');
            return;
        }

        const mapped = seasonEps.slice(0, MAX_ROWS).map(ep => ({
            episode_number: ep.number,
            name:     ep.name     || '',
            overview: ep.overview || '',
            air_date: ep.aired    || '',
            runtime:  ep.runtime  != null ? String(ep.runtime) : '',
        }));

        setConfigStatus('', '');
        configOverlay.classList.remove('active');
        showPreview(
            mapped, mapped[0]?.episode_number, seasonEps.length,
            `TVDB API · Series ${seriesId} · Season ${season} · ${mapped.length}/${seasonEps.length} ตอน`
        );
    }

    // ── Build manual episodes ────────────────────────────────────────────────
    // ep1DateStr = air date of episode 1 (the very first episode of the season).
    // count      = number of episodes to generate (startEp … startEp+count-1).
    // The function first advances past (startEp-1) already-aired slots so the
    // returned episodes carry the correct calculated dates.
    function buildManualEpisodes(startEp, count, ep1DateStr, airDays, prefix, runtime) {
        const [y, m, d] = ep1DateStr.split('-').map(Number);
        let cur = new Date(y, m - 1, d);
        const useDays = airDays.length > 0;

        // Snap to first matching weekday (represents episode 1's air date)
        if (useDays) {
            let s = 0;
            while (!airDays.includes(cur.getDay()) && s++ < 7) cur.setDate(cur.getDate() + 1);
        }

        // Helper: advance cur by one airing interval
        function advanceOne() {
            if (useDays) {
                const pos  = airDays.indexOf(cur.getDay());
                const next = pos + 1;
                cur.setDate(cur.getDate() + (next < airDays.length
                    ? airDays[next] - cur.getDay()
                    : 7 - cur.getDay() + airDays[0]));
            } else {
                cur.setDate(cur.getDate() + 7);
            }
        }

        // Skip past episodes 1 … startEp-1 that were already added
        for (let skip = 1; skip < startEp; skip++) advanceOne();

        // Generate episodes startEp … startEp+count-1
        const episodes = [];
        for (let i = 0; i < count; i++) {
            const epNum = startEp + i;
            episodes.push({ episode_number: epNum, name: `${prefix} ${epNum}`, overview: '', air_date: toDateStr(cur), runtime });
            advanceOne();
        }
        return episodes;
    }

    // ════════════════════════════════════════════════════════════════════════
    // PREVIEW MODAL
    // ════════════════════════════════════════════════════════════════════════

    function showPreview(episodes, _startEp, _total, subtitle) {
        previewEpisodes = episodes.slice(0, MAX_ROWS);

        previewPanel.querySelector('#tm-preview-subtitle').textContent = subtitle;

        // Sync button only on TVDB side when Manual mode has a TMDB ID
        const syncBtn = previewPanel.querySelector('#tm-sync-tmdb');
        syncBtn.style.display = (isTvdb && tmdbSyncConfig) ? '' : 'none';
        if (tmdbSyncConfig) syncBtn.textContent = `↑ Sync to TMDB (ID: ${tmdbSyncConfig.seriesId})`;

        renderPreviewTable();
        setPreviewStatus('', '');
        previewOverlay.classList.add('active');
    }

    function renderPreviewTable() {
        const tbody = previewPanel.querySelector('#tm-preview-body');
        tbody.innerHTML = '';
        previewEpisodes.forEach((ep, idx) => {
            const tr = document.createElement('tr');
            tr.dataset.idx = idx;
            tr.innerHTML = `
                <td class="ep-num-cell">${idx + 1}</td>
                <td class="ep-num-cell">
                    <input type="number" class="ep-field" data-field="episode_number" value="${ep.episode_number}" style="width:52px;text-align:center">
                </td>
                <td><input type="text" class="ep-field" data-field="name" value="${escHtml(ep.name)}" maxlength="100"></td>
                <td><textarea class="ep-field" data-field="overview" rows="2" maxlength="1000">${escHtml(ep.overview)}</textarea></td>
                <td><input type="date" class="ep-field" data-field="air_date" value="${ep.air_date}"></td>
                <td><input type="number" class="ep-field" data-field="runtime" value="${ep.runtime}" min="0" style="width:60px"></td>
                <td style="white-space:nowrap">
                    <button class="tm-move-btn" data-dir="up"   ${idx === 0 ? 'disabled' : ''}>▲</button>
                    <button class="tm-move-btn" data-dir="down" ${idx === previewEpisodes.length - 1 ? 'disabled' : ''}>▼</button>
                </td>
            `;
            tr.querySelectorAll('.ep-field').forEach(inp => {
                inp.addEventListener('input', () => { previewEpisodes[idx][inp.dataset.field] = inp.value; });
            });
            tr.querySelectorAll('.tm-move-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    syncFieldsFromDOM();
                    const swap = btn.dataset.dir === 'up' ? idx - 1 : idx + 1;
                    if (swap < 0 || swap >= previewEpisodes.length) return;
                    [previewEpisodes[idx], previewEpisodes[swap]] = [previewEpisodes[swap], previewEpisodes[idx]];
                    renderPreviewTable();
                });
            });
            tbody.appendChild(tr);
        });
    }

    function syncFieldsFromDOM() {
        previewPanel.querySelector('#tm-preview-body').querySelectorAll('tr[data-idx]').forEach(tr => {
            const i = parseInt(tr.dataset.idx, 10);
            tr.querySelectorAll('.ep-field').forEach(inp => { previewEpisodes[i][inp.dataset.field] = inp.value; });
        });
    }

    // ════════════════════════════════════════════════════════════════════════
    // ACTION: FILL TVDB FORM
    // ════════════════════════════════════════════════════════════════════════
    function doFillTvdb() {
        syncFieldsFromDOM();
        const fieldset = document.querySelector('fieldset.noformat');
        if (!fieldset) { setPreviewStatus('Could not find the TVDB bulk-add form.', 'err'); return; }

        const addBtn = fieldset.querySelector('button.multirow-add');
        let rows = getRows(fieldset);
        const needed = Math.min(previewEpisodes.length, MAX_ROWS);
        let attempts = 0;
        while (rows.length < needed && addBtn && attempts++ < 30) {
            addBtn.click();
            rows = getRows(fieldset);
        }

        previewEpisodes.forEach((ep, i) => {
            if (i >= rows.length || i >= MAX_ROWS) return;
            const row = rows[i];
            setVal(row, 'input[name="number[]"]',     ep.episode_number);
            setVal(row, 'input[name="name[]"]',        ep.name);
            setVal(row, 'textarea[name="overview[]"]', ep.overview);
            setVal(row, 'input[name="date[]"]',         ep.air_date);
            setVal(row, 'input[name="runtime[]"]',      ep.runtime);
        });

        // Save episodes for cross-site use
        saveEpisodes(previewEpisodes);

        setPreviewStatus(`เติมข้อมูล TVDB สำเร็จ ${needed} ตอน · ตอนถูกบันทึกสำหรับใช้ใน TMDB ด้วย`, 'ok');
        setTimeout(() => {
            previewOverlay.classList.remove('active');
            setPreviewStatus('', '');
        }, 2200);
    }

    // ════════════════════════════════════════════════════════════════════════
    // ACTION: ADD EPISODES TO TMDB
    // Uses the page's own Kendo DataSource via unsafeWindow.jQuery.
    // This bypasses CSRF/WAF issues because requests go through the page's
    // own jQuery which already has all auth tokens configured.
    // ════════════════════════════════════════════════════════════════════════
    async function doAddToTmdb() {
        syncFieldsFromDOM();

        const confirmBtn = previewPanel.querySelector('#tm-preview-confirm');
        const backBtn    = previewPanel.querySelector('#tm-preview-back');
        confirmBtn.disabled = backBtn.disabled = true;

        // Access page's jQuery through unsafeWindow (bypasses Tampermonkey sandbox)
        const jq = (typeof unsafeWindow !== 'undefined' ? unsafeWindow.jQuery : null) || window.jQuery;
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

        // ── Check existing episodes to avoid duplicates ───────────────────
        setPreviewStatus('กำลังตรวจสอบตอนที่มีอยู่แล้ว…', 'warn');

        // Ensure data is loaded (grid might already have it)
        if (!ds.data().length) {
            await new Promise(resolve => {
                ds.one('change', resolve);
                ds.one('error', resolve);
                setTimeout(resolve, 8000);
                ds.read();
            });
        }

        const existingNums = new Set();
        const items = ds.data();
        for (let i = 0; i < items.length; i++) {
            existingNums.add(parseInt(items[i].episode_number, 10));
        }

        const toAdd   = previewEpisodes.filter(ep => !existingNums.has(parseInt(ep.episode_number, 10)));
        const skipped = previewEpisodes.length - toAdd.length;

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
                setTimeout(() => finish(false), 15000); // 15 s timeout per episode

                ds.add({
                    episode_number: parseInt(ep.episode_number, 10) || 1,
                    name:     ep.name     || '',
                    overview: ep.overview || '',
                    air_date: ep.air_date || '',
                    runtime:  ep.runtime  ? parseInt(ep.runtime, 10) : '',
                });
                ds.sync();
            });

            ok ? success++ : fail++;
            await sleep(400);
        }

        saveEpisodes(previewEpisodes);

        const skipNote = skipped > 0 ? ` · ข้าม ${skipped} ตอนที่มีอยู่แล้ว` : '';
        setPreviewStatus(
            fail === 0
                ? `✔ เพิ่ม ${success} ตอนลง TMDB สำเร็จ${skipNote} · ตอนถูกบันทึกสำหรับใช้ใน TVDB ด้วย`
                : `⚠ สำเร็จ ${success} · ล้มเหลว ${fail} ตอน${skipNote}`,
            fail === 0 ? 'ok' : 'warn'
        );
        confirmBtn.disabled = backBtn.disabled = false;

        // Refresh the grid display after all done
        if (fail === 0) setTimeout(() => ds.read(), 600);
    }

    // ════════════════════════════════════════════════════════════════════════
    // ACTION: SYNC FROM TVDB SIDE → TMDB  (cross-origin via GM_xmlhttpRequest)
    // ════════════════════════════════════════════════════════════════════════
    async function getTmdbCsrfToken(seriesId, season) {
        try {
            const res = await gmRequest({ method: 'GET', url: `https://www.themoviedb.org/tv/${seriesId}/season/${season}/edit?active_nav_item=episodes` });
            if (res.status !== 200) return null;
            const m = res.responseText.match(/<meta[^>]+name="csrf-token"[^>]+content="([^"]+)"/)
                   || res.responseText.match(/<meta[^>]+content="([^"]+)"[^>]+name="csrf-token"/);
            return m ? m[1] : null;
        } catch { return null; }
    }

    async function postEpisodeToTmdbRemote(seriesId, season, ep, csrfToken) {
        try {
            const res = await gmRequest({
                method: 'POST',
                url: `https://www.themoviedb.org/tv/${seriesId}/season/${season}/remote/episodes?translate=false`,
                headers: {
                    'Content-Type':     'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-CSRF-Token':     csrfToken,
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept':           'application/json, */*; q=0.01',
                },
                data: 'data=' + encodeURIComponent(JSON.stringify({
                    episode_number: parseInt(ep.episode_number, 10),
                    name:     ep.name     || '',
                    overview: ep.overview || '',
                    air_date: ep.air_date || '',
                    runtime:  ep.runtime ? parseInt(ep.runtime, 10) : '',
                })),
            });
            if (res.status === 200 || res.status === 201) {
                try { return !JSON.parse(res.responseText).failure; } catch { return true; }
            }
            return false;
        } catch { return false; }
    }

    async function doSyncToTmdb() {
        if (!tmdbSyncConfig) return;
        syncFieldsFromDOM();

        const syncBtn    = previewPanel.querySelector('#tm-sync-tmdb');
        const confirmBtn = previewPanel.querySelector('#tm-preview-confirm');
        syncBtn.disabled = confirmBtn.disabled = true;

        const { seriesId, season, seriesName } = tmdbSyncConfig;
        const label = seriesName ? `"${seriesName}"` : `ID ${seriesId}`;

        setPreviewStatus(`กำลังดึง TMDB session สำหรับ ${label}…`, 'warn');
        const csrf = await getTmdbCsrfToken(seriesId, season);
        if (!csrf) {
            setPreviewStatus('ไม่สามารถดึง CSRF token — กรุณา login TMDB ในเบราว์เซอร์นี้ก่อน', 'err');
            syncBtn.disabled = confirmBtn.disabled = false;
            return;
        }

        let success = 0, fail = 0;
        for (const ep of previewEpisodes) {
            setPreviewStatus(`Sync ตอนที่ ${ep.episode_number}… (${success + fail + 1}/${previewEpisodes.length})`, 'warn');
            await postEpisodeToTmdbRemote(seriesId, season, ep, csrf) ? success++ : fail++;
            await sleep(350);
        }

        setPreviewStatus(
            fail === 0 ? `✔ Sync เสร็จ: ${success} ตอนลง TMDB สำเร็จ`
                       : `⚠ สำเร็จ ${success} · ล้มเหลว ${fail} ตอน`,
            fail === 0 ? 'ok' : 'warn'
        );
        syncBtn.disabled = confirmBtn.disabled = false;
    }

    // ════════════════════════════════════════════════════════════════════════
    // UTILITIES
    // ════════════════════════════════════════════════════════════════════════
    function getRows(fieldset) { return Array.from(fieldset.querySelectorAll('.multirow-item')); }

    function setVal(row, selector, value) {
        const el = row.querySelector(selector);
        if (!el) return;
        el.value = value ?? '';
        el.dispatchEvent(new Event('input',  { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

})();
