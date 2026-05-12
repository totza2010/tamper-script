/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/modules/core.js"
/*!*****************************!*\
  !*** ./src/modules/core.js ***!
  \*****************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   MAX_ROWS: () => (/* binding */ MAX_ROWS),
/* harmony export */   buildManualEpisodes: () => (/* binding */ buildManualEpisodes),
/* harmony export */   buildManualSectionHtml: () => (/* binding */ buildManualSectionHtml),
/* harmony export */   clBtn: () => (/* binding */ clBtn),
/* harmony export */   clOverlay: () => (/* binding */ clOverlay),
/* harmony export */   clPanel: () => (/* binding */ clPanel),
/* harmony export */   configOverlay: () => (/* binding */ configOverlay),
/* harmony export */   configPanel: () => (/* binding */ configPanel),
/* harmony export */   dc: () => (/* binding */ dc),
/* harmony export */   escHtml: () => (/* binding */ escHtml),
/* harmony export */   getSavedEpisodes: () => (/* binding */ getSavedEpisodes),
/* harmony export */   gmRequest: () => (/* binding */ gmRequest),
/* harmony export */   isTmdb: () => (/* binding */ isTmdb),
/* harmony export */   isTvdb: () => (/* binding */ isTvdb),
/* harmony export */   pget: () => (/* binding */ pget),
/* harmony export */   previewOverlay: () => (/* binding */ previewOverlay),
/* harmony export */   previewPanel: () => (/* binding */ previewPanel),
/* harmony export */   pset: () => (/* binding */ pset),
/* harmony export */   renderPreviewTable: () => (/* binding */ renderPreviewTable),
/* harmony export */   saveEpisodes: () => (/* binding */ saveEpisodes),
/* harmony export */   savedAirDays: () => (/* binding */ savedAirDays),
/* harmony export */   savedStartDate: () => (/* binding */ savedStartDate),
/* harmony export */   setConfigStatus: () => (/* binding */ setConfigStatus),
/* harmony export */   setPreviewStatus: () => (/* binding */ setPreviewStatus),
/* harmony export */   showPreview: () => (/* binding */ showPreview),
/* harmony export */   sleep: () => (/* binding */ sleep),
/* harmony export */   state: () => (/* binding */ state),
/* harmony export */   syncFieldsFromDOM: () => (/* binding */ syncFieldsFromDOM),
/* harmony export */   tmdbIdFromUrl: () => (/* binding */ tmdbIdFromUrl),
/* harmony export */   toDateStr: () => (/* binding */ toDateStr),
/* harmony export */   triggerBtn: () => (/* binding */ triggerBtn),
/* harmony export */   tvdbSlug: () => (/* binding */ tvdbSlug),
/* harmony export */   updateCrosslinks: () => (/* binding */ updateCrosslinks),
/* harmony export */   urlSeason: () => (/* binding */ urlSeason)
/* harmony export */ });


// ════════════════════════════════════════════════════════════════════════════
// PART 1 — CORE
// Shared utilities, persistence, site detection, episode builder,
// and all UI components used by both TVDB and TMDB sides.
// ════════════════════════════════════════════════════════════════════════════

// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_ROWS = 25;

// ── Site detection ────────────────────────────────────────────────────────────
const isTvdb = location.hostname.includes('thetvdb.com');
const isTmdb = location.hostname.includes('themoviedb.org');

// ── URL parsing ───────────────────────────────────────────────────────────────
let urlSeason = '1';
let tvdbSlug = '';
let tmdbIdFromUrl = '';
if (isTvdb) {
  const m = location.pathname.match(/\/series\/([^/]+)\/seasons\/official\/(\d+)\/bulkadd/);
  if (m) {
    tvdbSlug = m[1];
    urlSeason = m[2];
  }
  if (tvdbSlug) GM_setValue('tvdb_slug', tvdbSlug);
}
if (isTmdb) {
  const m = location.pathname.match(/\/tv\/(\d+)\/season\/(\d+)\/edit/);
  if (m) {
    tmdbIdFromUrl = m[1];
    urlSeason = m[2];
  }
  if (tmdbIdFromUrl) GM_setValue('tmdb_id', tmdbIdFromUrl);
}

// ── Shared mutable state ──────────────────────────────────────────────────────
// A single object so all modules see the same reference.
const state = {
  previewEpisodes: [],
  currentMode: isTmdb ? 'manual' : 'tmdb'
};

// ── Persistence ───────────────────────────────────────────────────────────────
function pget(k, d = '') {
  return GM_getValue(k, d);
}
function pset(k, v) {
  GM_setValue(k, v);
}
function getSavedEpisodes() {
  try {
    return JSON.parse(pget('saved_episodes', 'null'));
  } catch {
    return null;
  }
}
function saveEpisodes(eps) {
  pset('saved_episodes', JSON.stringify(eps));
}

// ── General utilities ─────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
function toDateStr(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}
function gmRequest(opts) {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      ...opts,
      onload: resolve,
      onerror: () => reject(new Error('network')),
      ontimeout: () => reject(new Error('timeout'))
    });
  });
}

// ── Persisted manual-mode values ──────────────────────────────────────────────
const savedAirDays = (() => {
  try {
    return JSON.parse(pget('manual_airdays', '[]'));
  } catch {
    return [];
  }
})();
const savedStartDate = pget('manual_startdate', new Date().toISOString().split('T')[0]);

/** Returns "checked" if the given weekday index was previously saved. */
function dc(v) {
  return savedAirDays.includes(v) ? 'checked' : '';
}

// ── Episode date calculator ───────────────────────────────────────────────────
// ep1DateStr : air date of episode 1 (the very first episode of the season).
// count      : number of new episodes to generate.
// Skips (startEp-1) already-aired intervals so the returned episodes carry
// the correct calculated dates starting from `startEp`.
function buildManualEpisodes(startEp, count, ep1DateStr, airDays, prefix, runtime) {
  const [y, m, d] = ep1DateStr.split('-').map(Number);
  let cur = new Date(y, m - 1, d);
  const useDays = airDays.length > 0;

  // Snap to the first matching weekday (= episode 1's actual air day)
  if (useDays) {
    let s = 0;
    while (!airDays.includes(cur.getDay()) && s++ < 7) cur.setDate(cur.getDate() + 1);
  }
  function advanceOne() {
    if (useDays) {
      const pos = airDays.indexOf(cur.getDay());
      const next = pos + 1;
      cur.setDate(cur.getDate() + (next < airDays.length ? airDays[next] - cur.getDay() : 7 - cur.getDay() + airDays[0]));
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
    episodes.push({
      episode_number: epNum,
      name: `${prefix} ${epNum}`,
      overview: '',
      air_date: toDateStr(cur),
      runtime
    });
    advanceOne();
  }
  return episodes;
}

// ── Manual section HTML (shared between TVDB + TMDB config panels) ────────────
function buildManualSectionHtml() {
  return `
        <div class="tm-field">
            <label class="tm-label">ชื่อซีรี่</label>
            <input id="tm-m-showname" type="text" placeholder="e.g. มาตาลดา" value="${escHtml(pget('show_name'))}">
        </div>
        <div class="tm-field">
            <label class="tm-label">Season Number</label>
            <input id="tm-m-season" type="number" value="${urlSeason}" min="1">
        </div>
        <div class="tm-field">
            <label class="tm-label">
                จำนวนตอนทั้งหมดในซีซัน
                <span class="tm-hint-inline">(ระบบเพิ่มเฉพาะตอนที่ยังไม่มีอัตโนมัติ)</span>
            </label>
            <input id="tm-m-eps" type="number" value="${escHtml(pget('manual_eps_count', '13'))}" min="1">
        </div>
        <div class="tm-field">
            <label class="tm-label">คำนำหน้าชื่อตอน</label>
            <input id="tm-m-prefix" type="text"
                value="${escHtml(pget('manual_prefix', 'Episode'))}"
                placeholder="Episode, EP, ตอนที่">
        </div>
        <hr class="tm-divider">
        <p class="tm-section-title">ตารางออกอากาศ</p>
        <div class="tm-field">
            <label class="tm-label">
                วันที่ออกอากาศ <b>ตอนที่ 1</b>
                <span class="tm-hint-inline">(วันของตอนถัดไปคำนวนอัตโนมัติ)</span>
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
            <input id="tm-m-runtime" type="number"
                value="${escHtml(pget('manual_runtime', ''))}" min="0" placeholder="45">
        </div>
    `;
}

// ── DOM: Floating trigger button ──────────────────────────────────────────────
const triggerBtn = document.createElement('button');
triggerBtn.className = `tm-btn ${isTmdb ? 'tm-btn-tmdb' : 'tm-btn-primary'}`;
triggerBtn.textContent = isTmdb ? '▶ Bulk Add Episodes' : '▶ Fetch from TMDB';
triggerBtn.style.cssText = 'position:fixed;top:80px;right:20px;z-index:9999;' + 'box-shadow:0 2px 10px rgba(0,0,0,0.4);font-size:14px;';

// ── DOM: Config modal ─────────────────────────────────────────────────────────
const configOverlay = document.createElement('div');
configOverlay.className = 'tm-overlay';
const configPanel = document.createElement('div');
configPanel.className = 'tm-panel';
configPanel.style.cssText = 'width:440px;max-width:95vw;padding:26px 24px;max-height:90vh;overflow-y:auto;';
configOverlay.appendChild(configPanel);

// ── DOM: Preview modal ────────────────────────────────────────────────────────
const previewOverlay = document.createElement('div');
previewOverlay.className = 'tm-overlay';
const previewPanel = document.createElement('div');
previewPanel.className = 'tm-panel';
previewPanel.style.cssText = 'width:92vw;max-width:1100px;max-height:90vh;display:flex;flex-direction:column;';
previewPanel.innerHTML = `
    <div style="padding:18px 20px 14px;border-bottom:1px solid #2a2a45;flex-shrink:0">
        <h3 id="tm-preview-title" style="margin:0;font-size:17px;color:${isTvdb ? '#01b4e4' : '#01d277'}">
            ${isTvdb ? 'Preview & Confirm Episodes' : 'Preview & Add to TMDB'}
        </h3>
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
        <button id="tm-preview-confirm" class="tm-btn ${isTvdb ? 'tm-btn-success' : 'tm-btn-tmdb'}">
            ${isTvdb ? '✔ Fill TVDB Form' : '✔ Add to TMDB'}
        </button>
    </div>
`;
previewOverlay.appendChild(previewPanel);

// ── DOM: Cross-link modal ─────────────────────────────────────────────────────
const clBtn = document.createElement('button');
clBtn.textContent = '🔗 Cross-link';
clBtn.style.cssText = 'position:fixed;top:124px;right:20px;z-index:9999;' + 'padding:6px 12px;border:none;border-radius:4px;cursor:pointer;' + 'font-size:12px;font-weight:bold;background:#252540;color:#9ab;' + 'box-shadow:0 2px 8px rgba(0,0,0,0.4);';
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

// ── Status bar helpers ────────────────────────────────────────────────────────
function applyStatus(el, msg, type) {
  if (!msg) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'block';
  el.textContent = msg;
  el.style.background = type === 'ok' ? '#1a3a1a' : type === 'err' ? '#3a1a1a' : '#2e2a00';
  el.style.color = type === 'ok' ? '#6f6' : type === 'err' ? '#f66' : '#ffb';
}
function setConfigStatus(msg, type) {
  applyStatus(configPanel.querySelector('#tm-config-status'), msg, type);
}
function setPreviewStatus(msg, type) {
  applyStatus(previewPanel.querySelector('#tm-preview-status'), msg, type);
}

// ── Preview modal ─────────────────────────────────────────────────────────────
function showPreview(episodes, subtitle) {
  // No global cap here — TVDB side caps inside doFillTvdb() (form limit = 25).
  // TMDB side can add any number of episodes one-by-one via Kendo DataSource.
  state.previewEpisodes = [...episodes];
  previewPanel.querySelector('#tm-preview-subtitle').textContent = subtitle;
  renderPreviewTable();
  setPreviewStatus('', '');
  previewOverlay.classList.add('active');
}
function renderPreviewTable() {
  const tbody = previewPanel.querySelector('#tm-preview-body');
  tbody.innerHTML = '';
  state.previewEpisodes.forEach((ep, idx) => {
    const exists = !!ep._exists;
    const diff = !!ep._diff;

    // Row status class: new / exists / diff
    const rowClass = diff ? 'tm-ep-diff' : exists ? 'tm-ep-exists' : '';

    // Badge shown in the # column
    const badge = diff ? '<span class="tm-ep-badge tm-ep-badge-diff">↑ ต่าง</span>' : exists ? '<span class="tm-ep-badge tm-ep-badge-exists">✓ มีแล้ว</span>' : '';
    const tr = document.createElement('tr');
    tr.dataset.idx = idx;
    if (rowClass) tr.classList.add(rowClass);
    tr.innerHTML = `
            <td class="ep-num-cell">${idx + 1}${badge}</td>
            <td class="ep-num-cell">
                <input type="number" class="ep-field" data-field="episode_number"
                    value="${ep.episode_number}" style="width:52px;text-align:center">
            </td>
            <td><input type="text" class="ep-field" data-field="name"
                value="${escHtml(ep.name)}" maxlength="100"></td>
            <td><textarea class="ep-field" data-field="overview"
                rows="2" maxlength="1000">${escHtml(ep.overview)}</textarea></td>
            <td><input type="date" class="ep-field" data-field="air_date" value="${ep.air_date}"></td>
            <td><input type="number" class="ep-field" data-field="runtime"
                value="${ep.runtime}" min="0" style="width:60px"></td>
            <td style="white-space:nowrap">
                <button class="tm-move-btn" data-dir="up"   ${idx === 0 ? 'disabled' : ''}>▲</button>
                <button class="tm-move-btn" data-dir="down" ${idx === state.previewEpisodes.length - 1 ? 'disabled' : ''}>▼</button>
            </td>
        `;
    tr.querySelectorAll('.ep-field').forEach(inp => {
      inp.addEventListener('input', () => {
        state.previewEpisodes[idx][inp.dataset.field] = inp.value;
        // If user edits a field, clear the _exists flag so it won't be skipped
        if (inp.dataset.field !== 'episode_number') {
          state.previewEpisodes[idx]._exists = false;
          state.previewEpisodes[idx]._diff = false;
          tr.classList.remove('tm-ep-exists', 'tm-ep-diff');
        }
      });
    });
    tr.querySelectorAll('.tm-move-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        syncFieldsFromDOM();
        const swap = btn.dataset.dir === 'up' ? idx - 1 : idx + 1;
        if (swap < 0 || swap >= state.previewEpisodes.length) return;
        [state.previewEpisodes[idx], state.previewEpisodes[swap]] = [state.previewEpisodes[swap], state.previewEpisodes[idx]];
        renderPreviewTable();
      });
    });
    tbody.appendChild(tr);
  });
}
function syncFieldsFromDOM() {
  previewPanel.querySelector('#tm-preview-body').querySelectorAll('tr[data-idx]').forEach(tr => {
    const i = parseInt(tr.dataset.idx, 10);
    tr.querySelectorAll('.ep-field').forEach(inp => {
      state.previewEpisodes[i][inp.dataset.field] = inp.value;
    });
  });
}

// ── Cross-link: update hrefs after any ID change ──────────────────────────────
function updateCrosslinks() {
  const tid = pget('tmdb_id');
  const tSlug = pget('tvdb_slug');
  const tvdbEditLink = clPanel.querySelector('#cl-link-tvdb-edit');
  const tmdbExtLink = clPanel.querySelector('#cl-link-tmdb-ext');
  if (tvdbEditLink) {
    tvdbEditLink.href = tSlug ? `https://www.thetvdb.com/series/${tSlug}/edit` : '#';
    tvdbEditLink.style.opacity = tSlug ? '1' : '0.4';
  }
  if (tmdbExtLink) {
    tmdbExtLink.href = tid ? `https://www.themoviedb.org/tv/${tid}/edit?active_nav_item=external_ids` : '#';
    tmdbExtLink.style.opacity = tid ? '1' : '0.4';
  }
}

/***/ },

/***/ "./src/modules/tmdb.js"
/*!*****************************!*\
  !*** ./src/modules/tmdb.js ***!
  \*****************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   buildTmdbPanelHtml: () => (/* binding */ buildTmdbPanelHtml),
/* harmony export */   doAddToTmdb: () => (/* binding */ doAddToTmdb),
/* harmony export */   doFetchFromTvdb: () => (/* binding */ doFetchFromTvdb),
/* harmony export */   doLoadSaved: () => (/* binding */ doLoadSaved),
/* harmony export */   getTmdbExistingMap: () => (/* binding */ getTmdbExistingMap),
/* harmony export */   getTmdbNextEpisode: () => (/* binding */ getTmdbNextEpisode)
/* harmony export */ });
/* harmony import */ var _core_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./core.js */ "./src/modules/core.js");


// ════════════════════════════════════════════════════════════════════════════
// PART 3 — TMDB
// TMDB-specific: Kendo DataSource interaction, TVDB API fetch → TMDB add,
// saved-episodes loader, and TMDB-side config panel HTML.
// ════════════════════════════════════════════════════════════════════════════


// ── Normalize any date value to "YYYY-MM-DD" string for comparison ────────────
// Handles: Date objects, "2026-04-24", "24/4/2026", ISO timestamps, etc.
function normDate(d) {
  if (!d) return '';
  // JavaScript Date object (Kendo sometimes parses date fields internally)
  if (d instanceof Date) {
    if (isNaN(d)) return '';
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  }
  const s = String(d).trim();
  if (!s) return '';
  // Already YYYY-MM-DD (or ISO timestamp starting with that)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // d/m/yyyy or dd/mm/yyyy (TMDB display format)
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const [, dd, mm, yyyy] = dmy;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  // Fallback: generic Date parse
  const parsed = new Date(s);
  if (!isNaN(parsed)) {
    return [parsed.getFullYear(), String(parsed.getMonth() + 1).padStart(2, '0'), String(parsed.getDate()).padStart(2, '0')].join('-');
  }
  return s; // give up, return as-is
}

// ── Internal: get loaded Kendo DataSource (waits for data if empty) ───────────
async function _getKendoDS() {
  const jq = (typeof unsafeWindow !== 'undefined' ? unsafeWindow.jQuery : null) || window.jQuery;
  if (!jq) return null;
  const grid = jq('#grid').data('kendoGrid');
  if (!grid) return null;
  const ds = grid.dataSource;
  if (!ds.data().length) {
    await new Promise(resolve => {
      ds.one('change', resolve);
      ds.one('error', resolve);
      setTimeout(resolve, 5000);
      ds.read();
    });
  }
  return ds;
}

// ── Returns a Map<episodeNumber, {name, air_date, runtime}> from the grid ─────
async function getTmdbExistingMap() {
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
          name: item.name || '',
          air_date: item.air_date || '',
          runtime: item.runtime != null ? String(item.runtime) : ''
        });
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

// ── Returns max existing episode + 1 (used by doManual to auto-detect start) ──
async function getTmdbNextEpisode() {
  const map = await getTmdbExistingMap();
  if (!map.size) return 1;
  return Math.max(...map.keys()) + 1;
}

// ── TMDB-side config panel HTML ───────────────────────────────────────────────
function buildTmdbPanelHtml() {
  const saved = (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.getSavedEpisodes)();
  const savedLabel = saved ? `${saved.length} ตอน (บันทึกไว้)` : 'ยังไม่มีข้อมูลที่บันทึกไว้';
  return `
        <h3 style="margin:0 0 14px;color:#01d277;font-size:17px">Bulk Add Episodes (TMDB)</h3>
        <p style="margin:0 0 14px;font-size:12px;color:#567">
            Series ID: <b style="color:#01d277">${_core_js__WEBPACK_IMPORTED_MODULE_0__.tmdbIdFromUrl}</b>
            &nbsp;·&nbsp;
            Season: <b style="color:#01d277">${_core_js__WEBPACK_IMPORTED_MODULE_0__.urlSeason}</b>
        </p>
        <div class="tm-tabs">
            <div class="tm-tab active" data-mode="manual">Manual</div>
            <div class="tm-tab" data-mode="tvdb">จาก TVDB API</div>
            <div class="tm-tab" data-mode="saved">Saved Episodes</div>
        </div>

        <!-- Manual -->
        <div id="tm-manual-section">
            ${(0,_core_js__WEBPACK_IMPORTED_MODULE_0__.buildManualSectionHtml)()}
        </div>

        <!-- จาก TVDB API -->
        <div id="tm-tvdb-section" style="display:none">
            <div class="tm-field">
                <label class="tm-label">TVDB API Key</label>
                <input id="tm-tvdb-key" type="password"
                    placeholder="ดูได้ที่ thetvdb.com/api-information"
                    value="${(0,_core_js__WEBPACK_IMPORTED_MODULE_0__.escHtml)((0,_core_js__WEBPACK_IMPORTED_MODULE_0__.pget)('tvdb_apikey'))}">
                <p class="tm-hint">สมัครฟรีที่ thetvdb.com → My Account → API Keys</p>
            </div>
            <div class="tm-field">
                <label class="tm-label">TVDB Series ID (ตัวเลข)</label>
                <input id="tm-tvdb-series-id" type="text"
                    placeholder="e.g. 72449"
                    value="${(0,_core_js__WEBPACK_IMPORTED_MODULE_0__.escHtml)((0,_core_js__WEBPACK_IMPORTED_MODULE_0__.pget)('tvdb_numeric_id'))}">
            </div>
            <div class="tm-field">
                <label class="tm-label">Season Number</label>
                <input id="tm-tvdb-season" type="number" value="${_core_js__WEBPACK_IMPORTED_MODULE_0__.urlSeason}" min="1">
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
                ${saved ? `<div style="font-size:12px;color:#567">ซีรี่: ${(0,_core_js__WEBPACK_IMPORTED_MODULE_0__.escHtml)((0,_core_js__WEBPACK_IMPORTED_MODULE_0__.pget)('show_name') || '—')}</div>` : `<div style="font-size:12px;color:#445;margin-top:8px">
                           สร้างตอนใน TVDB ก่อน แล้วกลับมากด Saved Episodes ที่นี่
                       </div>`}
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
async function doFetchFromTvdb() {
  const apiKey = _core_js__WEBPACK_IMPORTED_MODULE_0__.configPanel.querySelector('#tm-tvdb-key')?.value.trim();
  const seriesId = _core_js__WEBPACK_IMPORTED_MODULE_0__.configPanel.querySelector('#tm-tvdb-series-id')?.value.trim();
  const season = parseInt(_core_js__WEBPACK_IMPORTED_MODULE_0__.configPanel.querySelector('#tm-tvdb-season')?.value, 10);
  const lang = _core_js__WEBPACK_IMPORTED_MODULE_0__.configPanel.querySelector('#tm-tvdb-lang')?.value.trim() || 'eng';
  if (!apiKey) {
    (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.setConfigStatus)('กรุณากรอก TVDB API Key', 'err');
    return;
  }
  if (!seriesId) {
    (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.setConfigStatus)('กรุณากรอก TVDB Series ID (ตัวเลข)', 'err');
    return;
  }
  if (!season) {
    (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.setConfigStatus)('กรุณากรอก Season Number', 'err');
    return;
  }
  (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.pset)('tvdb_apikey', apiKey);
  (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.pset)('tvdb_numeric_id', seriesId);
  (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.setConfigStatus)('กำลัง Login TVDB API…', 'warn');

  // Step 1: Authenticate → bearer token
  let token;
  try {
    const loginRes = await (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.gmRequest)({
      method: 'POST',
      url: 'https://api4.thetvdb.com/v4/login',
      headers: {
        'Content-Type': 'application/json'
      },
      data: JSON.stringify({
        apikey: apiKey
      })
    });
    if (loginRes.status !== 200) {
      (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.setConfigStatus)(`TVDB login failed: HTTP ${loginRes.status} — ตรวจสอบ API Key`, 'err');
      return;
    }
    const loginData = JSON.parse(loginRes.responseText);
    token = loginData.data?.token;
    if (!token) {
      (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.setConfigStatus)('TVDB login failed: ไม่ได้รับ token', 'err');
      return;
    }
  } catch (e) {
    (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.setConfigStatus)('TVDB login error: ' + e.message, 'err');
    return;
  }
  (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.setConfigStatus)(`กำลังดึง Season ${season} จาก TVDB…`, 'warn');

  // Step 2: Paginate through episodes
  let allEps = [];
  let page = 0;
  try {
    while (true) {
      const res = await (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.gmRequest)({
        method: 'GET',
        url: `https://api4.thetvdb.com/v4/series/${encodeURIComponent(seriesId)}/episodes/official?season=${season}&page=${page}`,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept-Language': lang
        }
      });
      if (res.status !== 200) {
        (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.setConfigStatus)(`TVDB API error: HTTP ${res.status}`, 'err');
        return;
      }
      const body = JSON.parse(res.responseText);
      const eps = body.data?.episodes ?? [];
      allEps = allEps.concat(eps);
      if (!body.links?.next || eps.length === 0) break;
      if (++page > 20) break; // safety cap
    }
  } catch (e) {
    (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.setConfigStatus)('TVDB fetch error: ' + e.message, 'err');
    return;
  }
  const seasonEps = allEps.filter(ep => ep.seasonNumber === season).sort((a, b) => a.number - b.number);
  if (!seasonEps.length) {
    (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.setConfigStatus)(`ไม่พบตอนใน Season ${season} (TVDB Series ${seriesId})`, 'err');
    return;
  }

  // Step 3: Check what's already in TMDB to mark duplicates in preview
  (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.setConfigStatus)('กำลังตรวจสอบตอนที่มีอยู่ใน TMDB…', 'warn');
  const existingMap = await getTmdbExistingMap();
  const mapped = seasonEps.map(ep => {
    const epNum = ep.number;
    const name = ep.name || '';
    const airDate = ep.aired || '';
    const runtime = ep.runtime != null ? String(ep.runtime) : '';
    const existing = existingMap.get(epNum);

    // _exists: episode number already in TMDB
    // _diff:   exists but has different data from TVDB (potential update)
    let _exists = false,
      _diff = false;
    if (existing) {
      _exists = true;
      _diff = airDate && existing.air_date && normDate(airDate) !== normDate(existing.air_date) || runtime && existing.runtime && runtime !== existing.runtime;
    }
    return {
      episode_number: epNum,
      name,
      overview: ep.overview || '',
      air_date: airDate,
      runtime,
      _exists,
      _diff
    };
  });
  const newCount = mapped.filter(e => !e._exists).length;
  const existsCount = mapped.filter(e => e._exists && !e._diff).length;
  const diffCount = mapped.filter(e => e._diff).length;
  const parts = [`${newCount} ตอนใหม่`];
  if (existsCount) parts.push(`${existsCount} มีแล้ว`);
  if (diffCount) parts.push(`${diffCount} ข้อมูลต่าง`);
  (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.setConfigStatus)('', '');
  _core_js__WEBPACK_IMPORTED_MODULE_0__.configOverlay.classList.remove('active');
  (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.showPreview)(mapped, `TVDB API · Series ${seriesId} · Season ${season} · ${parts.join(' · ')}`);
}

// ── Add episodes to TMDB via the page's own Kendo DataSource ─────────────────
// Uses unsafeWindow.jQuery so requests go through the page's own auth stack
// (bypasses AWS WAF and avoids any CSRF/cookie issues).
async function doAddToTmdb() {
  (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.syncFieldsFromDOM)();
  const confirmBtn = _core_js__WEBPACK_IMPORTED_MODULE_0__.previewPanel.querySelector('#tm-preview-confirm');
  const backBtn = _core_js__WEBPACK_IMPORTED_MODULE_0__.previewPanel.querySelector('#tm-preview-back');
  confirmBtn.disabled = backBtn.disabled = true;
  const jq = (typeof unsafeWindow !== 'undefined' ? unsafeWindow.jQuery : null) || window.jQuery;
  if (!jq) {
    (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.setPreviewStatus)('ไม่พบ jQuery ในหน้า TMDB — กรุณา reload', 'err');
    confirmBtn.disabled = backBtn.disabled = false;
    return;
  }
  const grid = jq('#grid').data('kendoGrid');
  if (!grid) {
    (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.setPreviewStatus)('ไม่พบ Kendo Grid — กรุณา reload หน้า', 'err');
    confirmBtn.disabled = backBtn.disabled = false;
    return;
  }
  const ds = grid.dataSource;

  // Use _exists flags set during preview (already checked against live grid).
  // Episodes marked _exists=true are skipped; _diff episodes are skipped for now
  // (user can edit them manually or clear the flag by editing the field).
  const hasPreviewFlags = _core_js__WEBPACK_IMPORTED_MODULE_0__.state.previewEpisodes.some(ep => ep._exists !== undefined);
  let toAdd, skipped;
  if (hasPreviewFlags) {
    // Fast path: use pre-computed flags from doFetchFromTvdb / doLoadSaved
    toAdd = _core_js__WEBPACK_IMPORTED_MODULE_0__.state.previewEpisodes.filter(ep => !ep._exists);
    skipped = _core_js__WEBPACK_IMPORTED_MODULE_0__.state.previewEpisodes.length - toAdd.length;
  } else {
    // Fallback: re-read DataSource (doManual path, no pre-flags)
    (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.setPreviewStatus)('กำลังตรวจสอบตอนที่มีอยู่แล้ว…', 'warn');
    if (!ds.data().length) {
      await new Promise(resolve => {
        ds.one('change', resolve);
        ds.one('error', resolve);
        setTimeout(resolve, 8000);
        ds.read();
      });
    }
    const existingNums = new Set(Array.from(ds.data()).map(item => parseInt(item.episode_number, 10)));
    toAdd = _core_js__WEBPACK_IMPORTED_MODULE_0__.state.previewEpisodes.filter(ep => !existingNums.has(parseInt(ep.episode_number, 10)));
    skipped = _core_js__WEBPACK_IMPORTED_MODULE_0__.state.previewEpisodes.length - toAdd.length;
  }
  if (!toAdd.length) {
    (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.setPreviewStatus)(`ทุกตอนมีอยู่ใน TMDB แล้ว (${skipped} ตอน) — ไม่มีอะไรเพิ่ม`, 'ok');
    confirmBtn.disabled = backBtn.disabled = false;
    return;
  }
  if (skipped > 0) {
    (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.setPreviewStatus)(`ข้าม ${skipped} ตอนที่มีอยู่แล้ว · กำลังเพิ่ม ${toAdd.length} ตอนใหม่…`, 'warn');
    await (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.sleep)(800);
  }
  let success = 0,
    fail = 0;
  for (const ep of toAdd) {
    (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.setPreviewStatus)(`กำลังเพิ่มตอนที่ ${ep.episode_number}… (${success + fail + 1}/${toAdd.length})`, 'warn');
    const ok = await new Promise(resolve => {
      let done = false;
      const finish = v => {
        if (!done) {
          done = true;
          resolve(v);
        }
      };
      ds.one('sync', () => finish(true));
      ds.one('error', () => finish(false));
      setTimeout(() => finish(false), 15000);
      ds.add({
        episode_number: parseInt(ep.episode_number, 10) || 1,
        name: ep.name || '',
        overview: ep.overview || '',
        air_date: ep.air_date || '',
        runtime: ep.runtime ? parseInt(ep.runtime, 10) : ''
      });
      ds.sync();
    });
    ok ? success++ : fail++;
    await (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.sleep)(400);
  }
  (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.saveEpisodes)(_core_js__WEBPACK_IMPORTED_MODULE_0__.state.previewEpisodes);
  const skipNote = skipped > 0 ? ` · ข้าม ${skipped} ตอนที่มีอยู่แล้ว` : '';
  (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.setPreviewStatus)(fail === 0 ? `✔ เพิ่ม ${success} ตอนลง TMDB สำเร็จ${skipNote}` : `⚠ สำเร็จ ${success} · ล้มเหลว ${fail} ตอน${skipNote}`, fail === 0 ? 'ok' : 'warn');
  confirmBtn.disabled = backBtn.disabled = false;

  // Refresh grid so the new rows appear immediately
  if (fail === 0) setTimeout(() => ds.read(), 600);
}

// ── Load previously saved episodes (created on TVDB side) ────────────────────
async function doLoadSaved() {
  const saved = (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.getSavedEpisodes)();
  if (!saved || !saved.length) {
    (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.setConfigStatus)('ยังไม่มีตอนที่บันทึกไว้ กรุณาสร้างตอนใน TVDB ก่อน', 'err');
    return;
  }
  (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.setConfigStatus)('กำลังตรวจสอบตอนที่มีอยู่ใน TMDB…', 'warn');
  const existingMap = await getTmdbExistingMap();
  const marked = saved.map(ep => {
    const existing = existingMap.get(parseInt(ep.episode_number, 10));
    if (!existing) return {
      ...ep,
      _exists: false,
      _diff: false
    };
    const _diff = ep.air_date && existing.air_date && normDate(ep.air_date) !== normDate(existing.air_date) || ep.runtime && existing.runtime && ep.runtime !== existing.runtime;
    return {
      ...ep,
      _exists: true,
      _diff
    };
  });
  const newCount = marked.filter(e => !e._exists).length;
  const existsCount = marked.filter(e => e._exists && !e._diff).length;
  const diffCount = marked.filter(e => e._diff).length;
  const parts = [`${newCount} ตอนใหม่`];
  if (existsCount) parts.push(`${existsCount} มีแล้ว`);
  if (diffCount) parts.push(`${diffCount} ข้อมูลต่าง`);
  (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.setConfigStatus)('', '');
  _core_js__WEBPACK_IMPORTED_MODULE_0__.configOverlay.classList.remove('active');
  (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.showPreview)(marked, `Saved · ${(0,_core_js__WEBPACK_IMPORTED_MODULE_0__.pget)('show_name') || '—'} · Season ${_core_js__WEBPACK_IMPORTED_MODULE_0__.urlSeason} · ${parts.join(' · ')}`);
}

/***/ },

/***/ "./src/modules/tvdb.js"
/*!*****************************!*\
  !*** ./src/modules/tvdb.js ***!
  \*****************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   buildTvdbPanelHtml: () => (/* binding */ buildTvdbPanelHtml),
/* harmony export */   doFetchFromTmdb: () => (/* binding */ doFetchFromTmdb),
/* harmony export */   doFillTvdb: () => (/* binding */ doFillTvdb),
/* harmony export */   getFormStartEpisode: () => (/* binding */ getFormStartEpisode)
/* harmony export */ });
/* harmony import */ var _core_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./core.js */ "./src/modules/core.js");


// ════════════════════════════════════════════════════════════════════════════
// PART 4 — TVDB
// TVDB-specific: form scraping, TMDB API fetch → TVDB form fill,
// and TVDB-side config panel HTML.
// ════════════════════════════════════════════════════════════════════════════


// ── Read the starting episode number directly from the TVDB bulk-add form ─────
function getFormStartEpisode() {
  const el = document.querySelector('fieldset.noformat input[name="number[]"]');
  if (!el) return 1;
  const v = parseInt(el.value, 10);
  return isNaN(v) ? 1 : v;
}

// ── TVDB-side config panel HTML ───────────────────────────────────────────────
function buildTvdbPanelHtml() {
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
                    value="${(0,_core_js__WEBPACK_IMPORTED_MODULE_0__.escHtml)((0,_core_js__WEBPACK_IMPORTED_MODULE_0__.pget)('tmdb_apikey'))}">
            </div>
            <div class="tm-field">
                <label class="tm-label">TMDB Show ID</label>
                <input id="tm-show" type="text"
                    placeholder="e.g. 17454"
                    value="${(0,_core_js__WEBPACK_IMPORTED_MODULE_0__.escHtml)((0,_core_js__WEBPACK_IMPORTED_MODULE_0__.pget)('tmdb_id'))}">
            </div>
            <div class="tm-field">
                <label class="tm-label">Season Number</label>
                <input id="tm-season" type="number" value="${_core_js__WEBPACK_IMPORTED_MODULE_0__.urlSeason}" min="1">
            </div>
            <div class="tm-field">
                <label class="tm-label">Language</label>
                <input id="tm-lang" type="text" value="en-US" placeholder="en-US / th-TH">
            </div>
        </div>

        <!-- Manual -->
        <div id="tm-manual-section" style="display:none">
            ${(0,_core_js__WEBPACK_IMPORTED_MODULE_0__.buildManualSectionHtml)()}
        </div>

        <div id="tm-config-status" class="tm-status"></div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">
            <button id="tm-cancel" class="tm-btn tm-btn-secondary">Cancel</button>
            <button id="tm-go" class="tm-btn tm-btn-primary">Fetch Episodes</button>
        </div>
    `;
}

// ── Fetch from TMDB API v3 → fill TVDB bulk-add form ─────────────────────────
async function doFetchFromTmdb() {
  const apiKey = _core_js__WEBPACK_IMPORTED_MODULE_0__.configPanel.querySelector('#tm-key').value.trim();
  const showId = _core_js__WEBPACK_IMPORTED_MODULE_0__.configPanel.querySelector('#tm-show').value.trim();
  const season = _core_js__WEBPACK_IMPORTED_MODULE_0__.configPanel.querySelector('#tm-season').value.trim();
  const lang = _core_js__WEBPACK_IMPORTED_MODULE_0__.configPanel.querySelector('#tm-lang').value.trim() || 'en-US';
  if (!apiKey || !showId || !season) {
    (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.setConfigStatus)('กรุณากรอก API Key, Show ID, และ Season', 'err');
    return;
  }
  (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.pset)('tmdb_apikey', apiKey);
  (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.pset)('tmdb_id', showId);
  (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.setConfigStatus)('Fetching from TMDB…', 'warn');
  let res;
  try {
    res = await (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.gmRequest)({
      method: 'GET',
      url: `https://api.themoviedb.org/3/tv/${encodeURIComponent(showId)}/season/${encodeURIComponent(season)}?api_key=${encodeURIComponent(apiKey)}&language=${encodeURIComponent(lang)}`
    });
  } catch {
    (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.setConfigStatus)('Network error.', 'err');
    return;
  }
  if (res.status !== 200) {
    (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.setConfigStatus)(`TMDB error: HTTP ${res.status}`, 'err');
    return;
  }
  let data;
  try {
    data = JSON.parse(res.responseText);
  } catch {
    (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.setConfigStatus)('Failed to parse TMDB response.', 'err');
    return;
  }
  const all = data.episodes;
  if (!all?.length) {
    (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.setConfigStatus)('No episodes returned. Check Show ID and season.', 'err');
    return;
  }

  // Start from the episode the TVDB form is already at
  const startEp = getFormStartEpisode();
  const startIdx = all.findIndex(e => e.episode_number >= startEp);
  if (startIdx === -1) {
    (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.setConfigStatus)(`No episode ≥ ${startEp} found.`, 'err');
    return;
  }

  // Take all remaining episodes from the detected start point (no artificial cap).
  // doFillTvdb will add exactly as many rows as needed.
  const mapped = all.slice(startIdx).map(ep => ({
    episode_number: ep.episode_number,
    name: ep.name || '',
    overview: ep.overview || '',
    air_date: ep.air_date || '',
    runtime: ep.runtime != null ? String(ep.runtime) : ''
  }));
  (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.setConfigStatus)('', '');
  _core_js__WEBPACK_IMPORTED_MODULE_0__.configOverlay.classList.remove('active');
  (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.showPreview)(mapped, `TMDB · Show ${showId} · Season ${season} · ตอน ${startEp}–${all[all.length - 1].episode_number} (${mapped.length} ตอน)`);
}

// ── Fill TVDB bulk-add form with previewEpisodes ──────────────────────────────
function doFillTvdb() {
  (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.syncFieldsFromDOM)();
  const fieldset = document.querySelector('fieldset.noformat');
  if (!fieldset) {
    (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.setPreviewStatus)('Could not find the TVDB bulk-add form.', 'err');
    return;
  }
  const addBtn = fieldset.querySelector('button.multirow-add');
  let rows = _getRows(fieldset);
  const needed = _core_js__WEBPACK_IMPORTED_MODULE_0__.state.previewEpisodes.length;

  // Click "add row" as many times as needed (generous attempt limit)
  let attempts = 0;
  while (rows.length < needed && addBtn && attempts++ < needed * 2 + 10) {
    addBtn.click();
    rows = _getRows(fieldset);
  }
  _core_js__WEBPACK_IMPORTED_MODULE_0__.state.previewEpisodes.forEach((ep, i) => {
    if (i >= rows.length) return;
    const row = rows[i];
    _setVal(row, 'input[name="number[]"]', ep.episode_number);
    _setVal(row, 'input[name="name[]"]', ep.name);
    _setVal(row, 'textarea[name="overview[]"]', ep.overview);
    _setVal(row, 'input[name="date[]"]', ep.air_date);
    _setVal(row, 'input[name="runtime[]"]', ep.runtime);
  });
  const filled = Math.min(needed, rows.length);
  (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.saveEpisodes)(_core_js__WEBPACK_IMPORTED_MODULE_0__.state.previewEpisodes);
  (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.setPreviewStatus)(`เติมข้อมูล TVDB สำเร็จ ${filled} ตอน · บันทึกสำหรับใช้ใน TMDB ด้วย`, 'ok');
  setTimeout(() => {
    _core_js__WEBPACK_IMPORTED_MODULE_0__.previewOverlay.classList.remove('active');
    (0,_core_js__WEBPACK_IMPORTED_MODULE_0__.setPreviewStatus)('', '');
  }, 2200);
}

// ── TVDB form helpers ─────────────────────────────────────────────────────────
function _getRows(fieldset) {
  return Array.from(fieldset.querySelectorAll('.multirow-item'));
}
function _setVal(row, selector, value) {
  const el = row.querySelector(selector);
  if (!el) return;
  el.value = value ?? '';
  el.dispatchEvent(new Event('input', {
    bubbles: true
  }));
  el.dispatchEvent(new Event('change', {
    bubbles: true
  }));
}

/***/ },

/***/ "./node_modules/css-loader/dist/cjs.js!./node_modules/sass-loader/dist/cjs.js??ruleSet[1].rules[1].use[2]!./src/scss/styles.scss"
/*!***************************************************************************************************************************************!*\
  !*** ./node_modules/css-loader/dist/cjs.js!./node_modules/sass-loader/dist/cjs.js??ruleSet[1].rules[1].use[2]!./src/scss/styles.scss ***!
  \***************************************************************************************************************************************/
(module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _node_modules_css_loader_dist_runtime_noSourceMaps_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../node_modules/css-loader/dist/runtime/noSourceMaps.js */ "./node_modules/css-loader/dist/runtime/noSourceMaps.js");
/* harmony import */ var _node_modules_css_loader_dist_runtime_noSourceMaps_js__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(_node_modules_css_loader_dist_runtime_noSourceMaps_js__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _node_modules_css_loader_dist_runtime_api_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../node_modules/css-loader/dist/runtime/api.js */ "./node_modules/css-loader/dist/runtime/api.js");
/* harmony import */ var _node_modules_css_loader_dist_runtime_api_js__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(_node_modules_css_loader_dist_runtime_api_js__WEBPACK_IMPORTED_MODULE_1__);
// Imports


var ___CSS_LOADER_EXPORT___ = _node_modules_css_loader_dist_runtime_api_js__WEBPACK_IMPORTED_MODULE_1___default()((_node_modules_css_loader_dist_runtime_noSourceMaps_js__WEBPACK_IMPORTED_MODULE_0___default()));
// Module
___CSS_LOADER_EXPORT___.push([module.id, `.tm-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  z-index: 10000;
  justify-content: center;
  align-items: center;
}
.tm-overlay.active {
  display: flex;
}

.tm-panel {
  background: #1a1a2e;
  color: #e0e0e0;
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.7);
  font-family: sans-serif;
  overflow: hidden;
}
.tm-panel input,
.tm-panel textarea,
.tm-panel select {
  width: 100%;
  padding: 7px 9px;
  box-sizing: border-box;
  background: #2a2a3e;
  border: 1px solid #555;
  color: #eee;
  border-radius: 4px;
  font-size: 13px;
}
.tm-panel input:focus,
.tm-panel textarea:focus,
.tm-panel select:focus {
  border-color: #01b4e4;
  outline: none;
}

.tm-label {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
  color: #9ab;
}

.tm-hint-inline {
  color: #567;
  font-size: 10px;
  font-weight: normal;
}

.tm-field {
  margin-bottom: 12px;
}

.tm-hint {
  margin: 4px 0 0;
  font-size: 11px;
  color: #567;
}

.tm-btn {
  padding: 8px 18px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  font-weight: bold;
  transition: opacity 0.15s;
}
.tm-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.tm-btn-primary {
  background: #01b4e4;
  color: #fff;
}
.tm-btn-primary:not(:disabled):hover {
  background: #02c8ff;
}

.tm-btn-secondary {
  background: #3a3a55;
  color: #ccc;
}
.tm-btn-secondary:not(:disabled):hover {
  background: #4a4a6a;
}

.tm-btn-success {
  background: #1a8a3a;
  color: #fff;
}
.tm-btn-success:not(:disabled):hover {
  background: #22aa48;
}

.tm-btn-tmdb {
  background: #032541;
  color: #01d277;
  border: 1px solid #01d277;
}
.tm-btn-tmdb:not(:disabled):hover {
  background: rgba(1, 210, 119, 0.13);
}

.tm-status {
  display: none;
  padding: 8px 10px;
  border-radius: 4px;
  font-size: 13px;
  margin-bottom: 12px;
}

.tm-tabs {
  display: flex;
  margin-bottom: 16px;
  border-bottom: 2px solid #2a2a45;
}

.tm-tab {
  padding: 8px 16px;
  cursor: pointer;
  font-size: 13px;
  font-weight: bold;
  color: #778;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  user-select: none;
}
.tm-tab:hover {
  color: #aac;
}
.tm-tab.active {
  color: #01b4e4;
  border-bottom-color: #01b4e4;
}

.tm-divider {
  border: none;
  border-top: 1px solid #2a2a45;
  margin: 14px 0;
}

.tm-section-title {
  font-size: 11px;
  color: #567;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin: 0 0 10px;
}

.tm-days {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.tm-day-label {
  display: flex;
  align-items: center;
  gap: 4px;
  background: #2a2a3e;
  border: 1px solid #444;
  border-radius: 4px;
  padding: 4px 9px;
  font-size: 12px;
  cursor: pointer;
}
.tm-day-label:has(input:checked) {
  border-color: #01b4e4;
  background: #1a2a3e;
  color: #01b4e4;
}
.tm-day-label input {
  width: auto;
  margin: 0;
}

.tm-crosslink-box {
  background: #161626;
  border: 1px solid #2a2a45;
  border-radius: 6px;
  padding: 12px 14px;
  margin-top: 4px;
}

.tm-crosslink-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.tm-crosslink-row:last-child {
  margin-bottom: 0;
}
.tm-crosslink-row .tm-label {
  margin: 0;
  width: 110px;
  flex-shrink: 0;
  font-size: 11px;
}
.tm-crosslink-row input {
  flex: 1;
  font-size: 12px;
  padding: 5px 7px;
}

.tm-copy-btn {
  padding: 4px 8px;
  font-size: 11px;
  border: 1px solid #444;
  border-radius: 3px;
  background: #2a2a3e;
  color: #9ab;
  cursor: pointer;
  white-space: nowrap;
}
.tm-copy-btn:hover {
  background: #3a3a55;
}

.tm-link-btn {
  display: inline-block;
  font-size: 11px;
  color: #01b4e4;
  text-decoration: none;
  padding: 3px 0;
  white-space: nowrap;
}
.tm-link-btn:hover {
  text-decoration: underline;
}

.tm-preview-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.tm-preview-table th {
  background: #252540;
  color: #9ab;
  font-weight: 600;
  padding: 7px 8px;
  text-align: left;
  position: sticky;
  top: 0;
}
.tm-preview-table td {
  padding: 5px 8px;
  border-bottom: 1px solid #2a2a45;
  vertical-align: middle;
}
.tm-preview-table tr:hover td {
  background: #22223a;
}
.tm-preview-table input,
.tm-preview-table textarea {
  background: #2a2a3e;
  border: 1px solid #444;
  color: #eee;
  border-radius: 3px;
  padding: 3px 5px;
  font-size: 12px;
  width: 100%;
  box-sizing: border-box;
}
.tm-preview-table textarea {
  resize: vertical;
  min-height: 44px;
}

.tm-move-btn {
  background: #3a3a55;
  color: #aaa;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  padding: 2px 6px;
  font-size: 13px;
}
.tm-move-btn:hover {
  background: #5a5a7a;
  color: #fff;
}
.tm-move-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.ep-num-cell {
  text-align: center;
  color: #01b4e4;
  font-weight: bold;
}

.tm-ep-exists {
  opacity: 0.45;
}
.tm-ep-exists td {
  background: #111120 !important;
}
.tm-ep-exists input, .tm-ep-exists textarea {
  color: #555 !important;
  border-color: #333 !important;
}

.tm-ep-diff td {
  background: #1a1800 !important;
}

.tm-ep-badge {
  display: block;
  font-size: 9px;
  font-weight: normal;
  letter-spacing: 0.02em;
  border-radius: 3px;
  padding: 1px 4px;
  margin-top: 3px;
  white-space: nowrap;
}

.tm-ep-badge-exists {
  background: #1a1a2a;
  color: #445;
  border: 1px solid #2a2a3a;
}

.tm-ep-badge-diff {
  background: #2a2200;
  color: #aa8800;
  border: 1px solid #443300;
}`, ""]);
// Exports
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (___CSS_LOADER_EXPORT___);


/***/ },

/***/ "./node_modules/css-loader/dist/runtime/api.js"
/*!*****************************************************!*\
  !*** ./node_modules/css-loader/dist/runtime/api.js ***!
  \*****************************************************/
(module) {



/*
  MIT License http://www.opensource.org/licenses/mit-license.php
  Author Tobias Koppers @sokra
*/
module.exports = function (cssWithMappingToString) {
  var list = [];

  // return the list of modules as css string
  list.toString = function toString() {
    return this.map(function (item) {
      var content = "";
      var needLayer = typeof item[5] !== "undefined";
      if (item[4]) {
        content += "@supports (".concat(item[4], ") {");
      }
      if (item[2]) {
        content += "@media ".concat(item[2], " {");
      }
      if (needLayer) {
        content += "@layer".concat(item[5].length > 0 ? " ".concat(item[5]) : "", " {");
      }
      content += cssWithMappingToString(item);
      if (needLayer) {
        content += "}";
      }
      if (item[2]) {
        content += "}";
      }
      if (item[4]) {
        content += "}";
      }
      return content;
    }).join("");
  };

  // import a list of modules into the list
  list.i = function i(modules, media, dedupe, supports, layer) {
    if (typeof modules === "string") {
      modules = [[null, modules, undefined]];
    }
    var alreadyImportedModules = {};
    if (dedupe) {
      for (var k = 0; k < this.length; k++) {
        var id = this[k][0];
        if (id != null) {
          alreadyImportedModules[id] = true;
        }
      }
    }
    for (var _k = 0; _k < modules.length; _k++) {
      var item = [].concat(modules[_k]);
      if (dedupe && alreadyImportedModules[item[0]]) {
        continue;
      }
      if (typeof layer !== "undefined") {
        if (typeof item[5] === "undefined") {
          item[5] = layer;
        } else {
          item[1] = "@layer".concat(item[5].length > 0 ? " ".concat(item[5]) : "", " {").concat(item[1], "}");
          item[5] = layer;
        }
      }
      if (media) {
        if (!item[2]) {
          item[2] = media;
        } else {
          item[1] = "@media ".concat(item[2], " {").concat(item[1], "}");
          item[2] = media;
        }
      }
      if (supports) {
        if (!item[4]) {
          item[4] = "".concat(supports);
        } else {
          item[1] = "@supports (".concat(item[4], ") {").concat(item[1], "}");
          item[4] = supports;
        }
      }
      list.push(item);
    }
  };
  return list;
};

/***/ },

/***/ "./node_modules/css-loader/dist/runtime/noSourceMaps.js"
/*!**************************************************************!*\
  !*** ./node_modules/css-loader/dist/runtime/noSourceMaps.js ***!
  \**************************************************************/
(module) {



module.exports = function (i) {
  return i[1];
};

/***/ },

/***/ "./src/scss/styles.scss"
/*!******************************!*\
  !*** ./src/scss/styles.scss ***!
  \******************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _node_modules_style_loader_dist_runtime_injectStylesIntoStyleTag_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! !../../node_modules/style-loader/dist/runtime/injectStylesIntoStyleTag.js */ "./node_modules/style-loader/dist/runtime/injectStylesIntoStyleTag.js");
/* harmony import */ var _node_modules_style_loader_dist_runtime_injectStylesIntoStyleTag_js__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(_node_modules_style_loader_dist_runtime_injectStylesIntoStyleTag_js__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _node_modules_style_loader_dist_runtime_styleDomAPI_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! !../../node_modules/style-loader/dist/runtime/styleDomAPI.js */ "./node_modules/style-loader/dist/runtime/styleDomAPI.js");
/* harmony import */ var _node_modules_style_loader_dist_runtime_styleDomAPI_js__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(_node_modules_style_loader_dist_runtime_styleDomAPI_js__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var _node_modules_style_loader_dist_runtime_insertBySelector_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! !../../node_modules/style-loader/dist/runtime/insertBySelector.js */ "./node_modules/style-loader/dist/runtime/insertBySelector.js");
/* harmony import */ var _node_modules_style_loader_dist_runtime_insertBySelector_js__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(_node_modules_style_loader_dist_runtime_insertBySelector_js__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var _node_modules_style_loader_dist_runtime_setAttributesWithoutAttributes_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! !../../node_modules/style-loader/dist/runtime/setAttributesWithoutAttributes.js */ "./node_modules/style-loader/dist/runtime/setAttributesWithoutAttributes.js");
/* harmony import */ var _node_modules_style_loader_dist_runtime_setAttributesWithoutAttributes_js__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(_node_modules_style_loader_dist_runtime_setAttributesWithoutAttributes_js__WEBPACK_IMPORTED_MODULE_3__);
/* harmony import */ var _node_modules_style_loader_dist_runtime_insertStyleElement_js__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! !../../node_modules/style-loader/dist/runtime/insertStyleElement.js */ "./node_modules/style-loader/dist/runtime/insertStyleElement.js");
/* harmony import */ var _node_modules_style_loader_dist_runtime_insertStyleElement_js__WEBPACK_IMPORTED_MODULE_4___default = /*#__PURE__*/__webpack_require__.n(_node_modules_style_loader_dist_runtime_insertStyleElement_js__WEBPACK_IMPORTED_MODULE_4__);
/* harmony import */ var _node_modules_style_loader_dist_runtime_styleTagTransform_js__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! !../../node_modules/style-loader/dist/runtime/styleTagTransform.js */ "./node_modules/style-loader/dist/runtime/styleTagTransform.js");
/* harmony import */ var _node_modules_style_loader_dist_runtime_styleTagTransform_js__WEBPACK_IMPORTED_MODULE_5___default = /*#__PURE__*/__webpack_require__.n(_node_modules_style_loader_dist_runtime_styleTagTransform_js__WEBPACK_IMPORTED_MODULE_5__);
/* harmony import */ var _node_modules_css_loader_dist_cjs_js_node_modules_sass_loader_dist_cjs_js_ruleSet_1_rules_1_use_2_styles_scss__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! !!../../node_modules/css-loader/dist/cjs.js!../../node_modules/sass-loader/dist/cjs.js??ruleSet[1].rules[1].use[2]!./styles.scss */ "./node_modules/css-loader/dist/cjs.js!./node_modules/sass-loader/dist/cjs.js??ruleSet[1].rules[1].use[2]!./src/scss/styles.scss");

      
      
      
      
      
      
      
      
      

var options = {};

options.styleTagTransform = (_node_modules_style_loader_dist_runtime_styleTagTransform_js__WEBPACK_IMPORTED_MODULE_5___default());
options.setAttributes = (_node_modules_style_loader_dist_runtime_setAttributesWithoutAttributes_js__WEBPACK_IMPORTED_MODULE_3___default());

      options.insert = _node_modules_style_loader_dist_runtime_insertBySelector_js__WEBPACK_IMPORTED_MODULE_2___default().bind(null, "head");
    
options.domAPI = (_node_modules_style_loader_dist_runtime_styleDomAPI_js__WEBPACK_IMPORTED_MODULE_1___default());
options.insertStyleElement = (_node_modules_style_loader_dist_runtime_insertStyleElement_js__WEBPACK_IMPORTED_MODULE_4___default());

var update = _node_modules_style_loader_dist_runtime_injectStylesIntoStyleTag_js__WEBPACK_IMPORTED_MODULE_0___default()(_node_modules_css_loader_dist_cjs_js_node_modules_sass_loader_dist_cjs_js_ruleSet_1_rules_1_use_2_styles_scss__WEBPACK_IMPORTED_MODULE_6__["default"], options);




       /* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (_node_modules_css_loader_dist_cjs_js_node_modules_sass_loader_dist_cjs_js_ruleSet_1_rules_1_use_2_styles_scss__WEBPACK_IMPORTED_MODULE_6__["default"] && _node_modules_css_loader_dist_cjs_js_node_modules_sass_loader_dist_cjs_js_ruleSet_1_rules_1_use_2_styles_scss__WEBPACK_IMPORTED_MODULE_6__["default"].locals ? _node_modules_css_loader_dist_cjs_js_node_modules_sass_loader_dist_cjs_js_ruleSet_1_rules_1_use_2_styles_scss__WEBPACK_IMPORTED_MODULE_6__["default"].locals : undefined);


/***/ },

/***/ "./node_modules/style-loader/dist/runtime/injectStylesIntoStyleTag.js"
/*!****************************************************************************!*\
  !*** ./node_modules/style-loader/dist/runtime/injectStylesIntoStyleTag.js ***!
  \****************************************************************************/
(module) {



var stylesInDOM = [];
function getIndexByIdentifier(identifier) {
  var result = -1;
  for (var i = 0; i < stylesInDOM.length; i++) {
    if (stylesInDOM[i].identifier === identifier) {
      result = i;
      break;
    }
  }
  return result;
}
function modulesToDom(list, options) {
  var idCountMap = {};
  var identifiers = [];
  for (var i = 0; i < list.length; i++) {
    var item = list[i];
    var id = options.base ? item[0] + options.base : item[0];
    var count = idCountMap[id] || 0;
    var identifier = "".concat(id, " ").concat(count);
    idCountMap[id] = count + 1;
    var indexByIdentifier = getIndexByIdentifier(identifier);
    var obj = {
      css: item[1],
      media: item[2],
      sourceMap: item[3],
      supports: item[4],
      layer: item[5]
    };
    if (indexByIdentifier !== -1) {
      stylesInDOM[indexByIdentifier].references++;
      stylesInDOM[indexByIdentifier].updater(obj);
    } else {
      var updater = addElementStyle(obj, options);
      options.byIndex = i;
      stylesInDOM.splice(i, 0, {
        identifier: identifier,
        updater: updater,
        references: 1
      });
    }
    identifiers.push(identifier);
  }
  return identifiers;
}
function addElementStyle(obj, options) {
  var api = options.domAPI(options);
  api.update(obj);
  var updater = function updater(newObj) {
    if (newObj) {
      if (newObj.css === obj.css && newObj.media === obj.media && newObj.sourceMap === obj.sourceMap && newObj.supports === obj.supports && newObj.layer === obj.layer) {
        return;
      }
      api.update(obj = newObj);
    } else {
      api.remove();
    }
  };
  return updater;
}
module.exports = function (list, options) {
  options = options || {};
  list = list || [];
  var lastIdentifiers = modulesToDom(list, options);
  return function update(newList) {
    newList = newList || [];
    for (var i = 0; i < lastIdentifiers.length; i++) {
      var identifier = lastIdentifiers[i];
      var index = getIndexByIdentifier(identifier);
      stylesInDOM[index].references--;
    }
    var newLastIdentifiers = modulesToDom(newList, options);
    for (var _i = 0; _i < lastIdentifiers.length; _i++) {
      var _identifier = lastIdentifiers[_i];
      var _index = getIndexByIdentifier(_identifier);
      if (stylesInDOM[_index].references === 0) {
        stylesInDOM[_index].updater();
        stylesInDOM.splice(_index, 1);
      }
    }
    lastIdentifiers = newLastIdentifiers;
  };
};

/***/ },

/***/ "./node_modules/style-loader/dist/runtime/insertBySelector.js"
/*!********************************************************************!*\
  !*** ./node_modules/style-loader/dist/runtime/insertBySelector.js ***!
  \********************************************************************/
(module) {



var memo = {};

/* istanbul ignore next  */
function getTarget(target) {
  if (typeof memo[target] === "undefined") {
    var styleTarget = document.querySelector(target);

    // Special case to return head of iframe instead of iframe itself
    if (window.HTMLIFrameElement && styleTarget instanceof window.HTMLIFrameElement) {
      try {
        // This will throw an exception if access to iframe is blocked
        // due to cross-origin restrictions
        styleTarget = styleTarget.contentDocument.head;
      } catch (e) {
        // istanbul ignore next
        styleTarget = null;
      }
    }
    memo[target] = styleTarget;
  }
  return memo[target];
}

/* istanbul ignore next  */
function insertBySelector(insert, style) {
  var target = getTarget(insert);
  if (!target) {
    throw new Error("Couldn't find a style target. This probably means that the value for the 'insert' parameter is invalid.");
  }
  target.appendChild(style);
}
module.exports = insertBySelector;

/***/ },

/***/ "./node_modules/style-loader/dist/runtime/insertStyleElement.js"
/*!**********************************************************************!*\
  !*** ./node_modules/style-loader/dist/runtime/insertStyleElement.js ***!
  \**********************************************************************/
(module) {



/* istanbul ignore next  */
function insertStyleElement(options) {
  var element = document.createElement("style");
  options.setAttributes(element, options.attributes);
  options.insert(element, options.options);
  return element;
}
module.exports = insertStyleElement;

/***/ },

/***/ "./node_modules/style-loader/dist/runtime/setAttributesWithoutAttributes.js"
/*!**********************************************************************************!*\
  !*** ./node_modules/style-loader/dist/runtime/setAttributesWithoutAttributes.js ***!
  \**********************************************************************************/
(module, __unused_webpack_exports, __webpack_require__) {



/* istanbul ignore next  */
function setAttributesWithoutAttributes(styleElement) {
  var nonce =  true ? __webpack_require__.nc : 0;
  if (nonce) {
    styleElement.setAttribute("nonce", nonce);
  }
}
module.exports = setAttributesWithoutAttributes;

/***/ },

/***/ "./node_modules/style-loader/dist/runtime/styleDomAPI.js"
/*!***************************************************************!*\
  !*** ./node_modules/style-loader/dist/runtime/styleDomAPI.js ***!
  \***************************************************************/
(module) {



/* istanbul ignore next  */
function apply(styleElement, options, obj) {
  var css = "";
  if (obj.supports) {
    css += "@supports (".concat(obj.supports, ") {");
  }
  if (obj.media) {
    css += "@media ".concat(obj.media, " {");
  }
  var needLayer = typeof obj.layer !== "undefined";
  if (needLayer) {
    css += "@layer".concat(obj.layer.length > 0 ? " ".concat(obj.layer) : "", " {");
  }
  css += obj.css;
  if (needLayer) {
    css += "}";
  }
  if (obj.media) {
    css += "}";
  }
  if (obj.supports) {
    css += "}";
  }
  var sourceMap = obj.sourceMap;
  if (sourceMap && typeof btoa !== "undefined") {
    css += "\n/*# sourceMappingURL=data:application/json;base64,".concat(btoa(unescape(encodeURIComponent(JSON.stringify(sourceMap)))), " */");
  }

  // For old IE
  /* istanbul ignore if  */
  options.styleTagTransform(css, styleElement, options.options);
}
function removeStyleElement(styleElement) {
  // istanbul ignore if
  if (styleElement.parentNode === null) {
    return false;
  }
  styleElement.parentNode.removeChild(styleElement);
}

/* istanbul ignore next  */
function domAPI(options) {
  if (typeof document === "undefined") {
    return {
      update: function update() {},
      remove: function remove() {}
    };
  }
  var styleElement = options.insertStyleElement(options);
  return {
    update: function update(obj) {
      apply(styleElement, options, obj);
    },
    remove: function remove() {
      removeStyleElement(styleElement);
    }
  };
}
module.exports = domAPI;

/***/ },

/***/ "./node_modules/style-loader/dist/runtime/styleTagTransform.js"
/*!*********************************************************************!*\
  !*** ./node_modules/style-loader/dist/runtime/styleTagTransform.js ***!
  \*********************************************************************/
(module) {



/* istanbul ignore next  */
function styleTagTransform(css, styleElement) {
  if (styleElement.styleSheet) {
    styleElement.styleSheet.cssText = css;
  } else {
    while (styleElement.firstChild) {
      styleElement.removeChild(styleElement.firstChild);
    }
    styleElement.appendChild(document.createTextNode(css));
  }
}
module.exports = styleTagTransform;

/***/ }

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			id: moduleId,
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		if (!(moduleId in __webpack_modules__)) {
/******/ 			delete __webpack_module_cache__[moduleId];
/******/ 			var e = new Error("Cannot find module '" + moduleId + "'");
/******/ 			e.code = 'MODULE_NOT_FOUND';
/******/ 			throw e;
/******/ 		}
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat get default export */
/******/ 	(() => {
/******/ 		// getDefaultExport function for compatibility with non-harmony modules
/******/ 		__webpack_require__.n = (module) => {
/******/ 			var getter = module && module.__esModule ?
/******/ 				() => (module['default']) :
/******/ 				() => (module);
/******/ 			__webpack_require__.d(getter, { a: getter });
/******/ 			return getter;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/nonce */
/******/ 	(() => {
/******/ 		__webpack_require__.nc = undefined;
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry needs to be wrapped in an IIFE because it needs to be isolated against other modules in the chunk.
(() => {
/*!**********************!*\
  !*** ./src/index.js ***!
  \**********************/
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _scss_styles_scss__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./scss/styles.scss */ "./src/scss/styles.scss");
/* harmony import */ var _modules_core_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./modules/core.js */ "./src/modules/core.js");
/* harmony import */ var _modules_tvdb_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./modules/tvdb.js */ "./src/modules/tvdb.js");
/* harmony import */ var _modules_tmdb_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./modules/tmdb.js */ "./src/modules/tmdb.js");




// ── Core (shared) ─────────────────────────────────────────────────────────────


// ── TVDB-specific ─────────────────────────────────────────────────────────────


// ── TMDB-specific ─────────────────────────────────────────────────────────────


// ════════════════════════════════════════════════════════════════════════════
// BUILD SITE-SPECIFIC CONFIG PANEL
// ════════════════════════════════════════════════════════════════════════════
_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.configPanel.innerHTML = _modules_core_js__WEBPACK_IMPORTED_MODULE_1__.isTvdb ? (0,_modules_tvdb_js__WEBPACK_IMPORTED_MODULE_2__.buildTvdbPanelHtml)() : (0,_modules_tmdb_js__WEBPACK_IMPORTED_MODULE_3__.buildTmdbPanelHtml)();

// ── Tab switching ─────────────────────────────────────────────────────────────
_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.configPanel.querySelectorAll('.tm-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    _modules_core_js__WEBPACK_IMPORTED_MODULE_1__.configPanel.querySelectorAll('.tm-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    _modules_core_js__WEBPACK_IMPORTED_MODULE_1__.state.currentMode = tab.dataset.mode;
    ['#tm-tmdb-section', '#tm-manual-section', '#tm-tvdb-section', '#tm-saved-section'].forEach(id => {
      const el = _modules_core_js__WEBPACK_IMPORTED_MODULE_1__.configPanel.querySelector(id);
      if (el) el.style.display = 'none';
    });
    const active = _modules_core_js__WEBPACK_IMPORTED_MODULE_1__.configPanel.querySelector(`#tm-${_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.state.currentMode}-section`);
    if (active) active.style.display = '';
    (0,_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.setConfigStatus)('', '');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// MANUAL MODE ORCHESTRATION
// Reads the config form, auto-detects startEp from the page, then calls
// buildManualEpisodes() with (startEp → totalEps) range.
// ════════════════════════════════════════════════════════════════════════════
async function doManual() {
  const showName = _modules_core_js__WEBPACK_IMPORTED_MODULE_1__.configPanel.querySelector('#tm-m-showname')?.value.trim() || '';
  const season = _modules_core_js__WEBPACK_IMPORTED_MODULE_1__.configPanel.querySelector('#tm-m-season')?.value.trim() || _modules_core_js__WEBPACK_IMPORTED_MODULE_1__.urlSeason;
  const totalEps = parseInt(_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.configPanel.querySelector('#tm-m-eps')?.value, 10);
  const prefix = _modules_core_js__WEBPACK_IMPORTED_MODULE_1__.configPanel.querySelector('#tm-m-prefix')?.value.trim() || 'Episode';
  const startDate = _modules_core_js__WEBPACK_IMPORTED_MODULE_1__.configPanel.querySelector('#tm-m-startdate')?.value;
  const runtime = _modules_core_js__WEBPACK_IMPORTED_MODULE_1__.configPanel.querySelector('#tm-m-runtime')?.value.trim() || '';
  if (!totalEps || totalEps < 1) {
    (0,_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.setConfigStatus)('กรุณากรอกจำนวนตอน', 'err');
    return;
  }
  if (!startDate) {
    (0,_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.setConfigStatus)('กรุณากรอกวันที่ออกอากาศตอนแรก', 'err');
    return;
  }

  // Auto-detect which episode to start from
  let startEpN;
  if (_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.isTvdb) {
    // TVDB: read from the first row of the bulk-add form
    startEpN = (0,_modules_tvdb_js__WEBPACK_IMPORTED_MODULE_2__.getFormStartEpisode)();
  } else {
    // TMDB: find max existing episode in Kendo grid + 1
    (0,_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.setConfigStatus)('กำลังตรวจสอบตอนที่มีอยู่แล้ว…', 'warn');
    startEpN = await (0,_modules_tmdb_js__WEBPACK_IMPORTED_MODULE_3__.getTmdbNextEpisode)();
  }
  if (startEpN > totalEps) {
    (0,_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.setConfigStatus)(`ตอนที่จะเริ่มเพิ่ม (${startEpN}) เกินจำนวนตอนทั้งหมด (${totalEps}) — ไม่มีตอนที่ต้องเพิ่ม`, 'err');
    return;
  }
  const newEpsCount = totalEps - startEpN + 1;

  // Persist all fields for next session
  (0,_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.pset)('show_name', showName);
  (0,_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.pset)('manual_eps_count', String(totalEps));
  (0,_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.pset)('manual_prefix', prefix);
  (0,_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.pset)('manual_startdate', startDate);
  (0,_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.pset)('manual_runtime', runtime);
  const airDays = Array.from(_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.configPanel.querySelectorAll('.tm-day-cb:checked')).map(cb => parseInt(cb.value, 10)).sort((a, b) => a - b);
  (0,_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.pset)('manual_airdays', JSON.stringify(airDays));
  const episodes = (0,_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.buildManualEpisodes)(startEpN, newEpsCount, startDate, airDays, prefix, runtime);
  const rangeLabel = newEpsCount === 1 ? `ตอน ${startEpN}` : `ตอน ${startEpN}–${totalEps}`;
  (0,_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.setConfigStatus)('', '');
  _modules_core_js__WEBPACK_IMPORTED_MODULE_1__.configOverlay.classList.remove('active');
  (0,_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.showPreview)(episodes, `Manual · ${showName || '—'} · Season ${season} · ${rangeLabel}`);
}

// ════════════════════════════════════════════════════════════════════════════
// EVENT WIRING — Config modal
// ════════════════════════════════════════════════════════════════════════════
_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.triggerBtn.addEventListener('click', () => {
  (0,_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.setConfigStatus)('', '');
  _modules_core_js__WEBPACK_IMPORTED_MODULE_1__.configOverlay.classList.add('active');
});
_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.configPanel.querySelector('#tm-cancel').addEventListener('click', () => _modules_core_js__WEBPACK_IMPORTED_MODULE_1__.configOverlay.classList.remove('active'));
_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.configOverlay.addEventListener('click', e => {
  if (e.target === _modules_core_js__WEBPACK_IMPORTED_MODULE_1__.configOverlay) _modules_core_js__WEBPACK_IMPORTED_MODULE_1__.configOverlay.classList.remove('active');
});
_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.configPanel.querySelector('#tm-go').addEventListener('click', () => {
  const mode = _modules_core_js__WEBPACK_IMPORTED_MODULE_1__.state.currentMode;
  if (mode === 'tmdb') (0,_modules_tvdb_js__WEBPACK_IMPORTED_MODULE_2__.doFetchFromTmdb)(); // TVDB side: fetch from TMDB API
  else if (mode === 'tvdb') (0,_modules_tmdb_js__WEBPACK_IMPORTED_MODULE_3__.doFetchFromTvdb)(); // TMDB side: fetch from TVDB API
  else if (mode === 'saved') (0,_modules_tmdb_js__WEBPACK_IMPORTED_MODULE_3__.doLoadSaved)(); // TMDB side: load saved episodes
  else doManual(); // both sides: manual schedule
});

// ════════════════════════════════════════════════════════════════════════════
// EVENT WIRING — Preview modal
// ════════════════════════════════════════════════════════════════════════════
_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.previewPanel.querySelector('#tm-preview-back').addEventListener('click', () => {
  _modules_core_js__WEBPACK_IMPORTED_MODULE_1__.previewOverlay.classList.remove('active');
  _modules_core_js__WEBPACK_IMPORTED_MODULE_1__.configOverlay.classList.add('active');
});
_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.previewOverlay.addEventListener('click', e => {
  if (e.target === _modules_core_js__WEBPACK_IMPORTED_MODULE_1__.previewOverlay) _modules_core_js__WEBPACK_IMPORTED_MODULE_1__.previewOverlay.classList.remove('active');
});
_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.previewPanel.querySelector('#tm-preview-confirm').addEventListener('click', () => {
  if (_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.isTvdb) (0,_modules_tvdb_js__WEBPACK_IMPORTED_MODULE_2__.doFillTvdb)();else (0,_modules_tmdb_js__WEBPACK_IMPORTED_MODULE_3__.doAddToTmdb)();
});

// ════════════════════════════════════════════════════════════════════════════
// EVENT WIRING — Cross-link modal
// ════════════════════════════════════════════════════════════════════════════
_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.clBtn.addEventListener('click', () => {
  (0,_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.updateCrosslinks)();
  _modules_core_js__WEBPACK_IMPORTED_MODULE_1__.clOverlay.classList.add('active');
});
_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.clOverlay.addEventListener('click', e => {
  if (e.target === _modules_core_js__WEBPACK_IMPORTED_MODULE_1__.clOverlay) _modules_core_js__WEBPACK_IMPORTED_MODULE_1__.clOverlay.classList.remove('active');
});
_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.clPanel.querySelector('#cl-close').addEventListener('click', () => _modules_core_js__WEBPACK_IMPORTED_MODULE_1__.clOverlay.classList.remove('active'));

// Copy-to-clipboard buttons
_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.clPanel.querySelectorAll('.tm-copy-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = _modules_core_js__WEBPACK_IMPORTED_MODULE_1__.clPanel.querySelector('#' + btn.dataset.copy);
    if (!input?.value) return;
    navigator.clipboard.writeText(input.value).then(() => {
      const orig = btn.textContent;
      btn.textContent = '✔';
      setTimeout(() => {
        btn.textContent = orig;
      }, 1500);
    });
  });
});

// Save IDs on input and refresh cross-link hrefs
_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.clPanel.querySelector('#cl-tmdb-id').addEventListener('input', e => {
  (0,_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.pset)('tmdb_id', e.target.value.trim());
  (0,_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.updateCrosslinks)();
});
_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.clPanel.querySelector('#cl-tvdb-id').addEventListener('input', e => {
  (0,_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.pset)('tvdb_numeric_id', e.target.value.trim());
  (0,_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.updateCrosslinks)();
});
_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.clPanel.querySelector('#cl-tvdb-slug').addEventListener('input', e => {
  (0,_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.pset)('tvdb_slug', e.target.value.trim());
  (0,_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.updateCrosslinks)();
});

// ════════════════════════════════════════════════════════════════════════════
// MOUNT ALL UI TO THE PAGE
// ════════════════════════════════════════════════════════════════════════════
document.body.appendChild(_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.triggerBtn);
document.body.appendChild(_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.configOverlay);
document.body.appendChild(_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.previewOverlay);
document.body.appendChild(_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.clBtn);
document.body.appendChild(_modules_core_js__WEBPACK_IMPORTED_MODULE_1__.clOverlay);
})();

/******/ })()
;