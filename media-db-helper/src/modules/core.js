'use strict';

// ════════════════════════════════════════════════════════════════════════════
// PART 1 — CORE
// Shared utilities, persistence, site detection, episode builder,
// and all UI components used by both TVDB and TMDB sides.
// ════════════════════════════════════════════════════════════════════════════

// ── Site detection ────────────────────────────────────────────────────────────
export const isTvdb = location.hostname.includes('thetvdb.com');
export const isTmdb = location.hostname.includes('themoviedb.org');

// ── URL parsing ───────────────────────────────────────────────────────────────
export let urlSeason     = '1';
export let tvdbSlug      = '';
export let tmdbIdFromUrl = '';

if (isTvdb) {
    const m = location.pathname.match(/\/series\/([^/]+)\/seasons\/official\/(\d+)\/bulkadd/);
    if (m) { tvdbSlug = m[1]; urlSeason = m[2]; }
    if (tvdbSlug) GM_setValue('tvdb_slug', tvdbSlug);
}
if (isTmdb) {
    const m = location.pathname.match(/\/tv\/(\d+)\/season\/(\d+)\/edit/);
    if (m) { tmdbIdFromUrl = m[1]; urlSeason = m[2]; }
    if (tmdbIdFromUrl) GM_setValue('tmdb_id', tmdbIdFromUrl);
}

// ── Shared mutable state ──────────────────────────────────────────────────────
// A single object so all modules see the same reference.
export const state = {
    previewEpisodes: [],
    currentMode: isTmdb ? 'manual' : 'tmdb',
};

// ── Persistence ───────────────────────────────────────────────────────────────
export function pget(k, d = '') { return GM_getValue(k, d); }
export function pset(k, v)      { GM_setValue(k, v); }

export function getSavedEpisodes() {
    try { return JSON.parse(pget('saved_episodes', 'null')); } catch { return null; }
}
export function saveEpisodes(eps) { pset('saved_episodes', JSON.stringify(eps)); }

// ── General utilities ─────────────────────────────────────────────────────────
export function escHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export function toDateStr(date) {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
    ].join('-');
}

/**
 * Normalize any date value to "YYYY-MM-DD" string.
 * Handles: Date objects, "2026-04-24", ISO timestamps,
 * and d/m/yyyy display format used by TMDB's Kendo grid.
 */
export function normDate(d) {
    if (!d) return '';
    if (d instanceof Date) return isNaN(d) ? '' : toDateStr(d);
    const s = String(d).trim();
    if (!s) return '';
    // Already YYYY-MM-DD (or ISO timestamp)
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    // d/m/yyyy or dd/mm/yyyy  (TMDB Kendo display format)
    const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) {
        const [, dd, mm, yyyy] = dmy;
        return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }
    // Generic fallback
    const parsed = new Date(s);
    return isNaN(parsed) ? s : toDateStr(parsed);
}

/**
 * Build a subtitle parts array from a list of episodes that have _exists/_diff flags.
 * Returns e.g. ["5 ตอนใหม่", "20 มีแล้ว", "2 ข้อมูลต่าง"]
 * Caller joins however it likes, e.g. parts.join(' · ')
 */
export function episodeStatusParts(episodes) {
    const newCount    = episodes.filter(e => !e._exists).length;
    const existsCount = episodes.filter(e =>  e._exists && !e._diff).length;
    const diffCount   = episodes.filter(e =>  e._diff).length;
    const parts = [`${newCount} ตอนใหม่`];
    if (existsCount) parts.push(`${existsCount} มีแล้ว`);
    if (diffCount)   parts.push(`${diffCount} ข้อมูลต่าง`);
    return parts;
}

export function gmRequest(opts) {
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            ...opts,
            onload:    resolve,
            onerror:   () => reject(new Error('network')),
            ontimeout: () => reject(new Error('timeout')),
        });
    });
}

// ── Persisted manual-mode values ──────────────────────────────────────────────
export const savedAirDays = (() => {
    try { return JSON.parse(pget('manual_airdays', '[]')); } catch { return []; }
})();
export const savedStartDate = pget('manual_startdate', new Date().toISOString().split('T')[0]);

/** Returns "checked" if the given weekday index was previously saved. */
export function dc(v) { return savedAirDays.includes(v) ? 'checked' : ''; }

// ── Episode date calculator ───────────────────────────────────────────────────
// ep1DateStr : air date of episode 1 (the very first episode of the season).
// count      : number of new episodes to generate.
// Skips (startEp-1) already-aired intervals so the returned episodes carry
// the correct calculated dates starting from `startEp`.
export function buildManualEpisodes(startEp, count, ep1DateStr, airDays, prefix, runtime, epsPerDay = 1) {
    const [y, m, d] = ep1DateStr.split('-').map(Number);
    let cur = new Date(y, m - 1, d);
    const useDays = airDays.length > 0;
    const eps = Math.max(1, epsPerDay);

    // Snap to the first matching weekday (= episode 1's actual air day)
    if (useDays) {
        let s = 0;
        while (!airDays.includes(cur.getDay()) && s++ < 7) cur.setDate(cur.getDate() + 1);
    }

    function advanceOne() {
        if (useDays) {
            const pos  = airDays.indexOf(cur.getDay());
            const next = pos + 1;
            cur.setDate(cur.getDate() + (
                next < airDays.length
                    ? airDays[next] - cur.getDay()
                    : 7 - cur.getDay() + airDays[0]
            ));
        } else {
            cur.setDate(cur.getDate() + 7);
        }
    }

    // Skip full air-day slots before startEp.
    // Each slot holds `eps` episodes — all sharing the same date.
    // e.g. epsPerDay=2, startEp=3 → 1 full slot (ep1+ep2) → advance once.
    const fullSlotsBefore = Math.floor((startEp - 1) / eps);
    for (let s = 0; s < fullSlotsBefore; s++) advanceOne();

    // Generate episodes startEp … startEp+count-1
    const episodes = [];
    let slotPos = (startEp - 1) % eps; // position within the current slot
    for (let i = 0; i < count; i++) {
        const epNum = startEp + i;
        episodes.push({
            episode_number: epNum,
            name:     `${prefix} ${epNum}`,
            overview: '',
            air_date: toDateStr(cur),
            runtime,
        });
        slotPos++;
        if (slotPos >= eps) { slotPos = 0; advanceOne(); }
    }
    return episodes;
}

// ── Manual section HTML (shared between TVDB + TMDB config panels) ────────────
export function buildManualSectionHtml() {
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
            <label class="tm-label">
                จำนวนตอนต่อวัน
                <span class="tm-hint-inline">(เช่น 2 = ออก 2 ตอนในวันเดียวกัน)</span>
            </label>
            <input id="tm-m-epperday" type="number"
                value="${escHtml(pget('manual_epperday', '1'))}"
                min="1" max="20" style="width:80px">
        </div>
        <div class="tm-field">
            <label class="tm-label">Runtime (นาที, ไม่บังคับ)</label>
            <input id="tm-m-runtime" type="number"
                value="${escHtml(pget('manual_runtime', ''))}" min="0" placeholder="45">
        </div>
    `;
}

// ── DOM: Floating trigger button ──────────────────────────────────────────────
export const triggerBtn = document.createElement('button');
triggerBtn.className = `tm-btn ${isTmdb ? 'tm-btn-tmdb' : 'tm-btn-primary'}`;
triggerBtn.textContent = isTmdb ? '▶ Bulk Add Episodes' : '▶ Fetch from TMDB';
triggerBtn.style.cssText =
    'position:fixed;top:80px;right:20px;z-index:9999;' +
    'box-shadow:0 2px 10px rgba(0,0,0,0.4);font-size:14px;';

// ── DOM: Config modal ─────────────────────────────────────────────────────────
export const configOverlay = document.createElement('div');
configOverlay.className = 'tm-overlay';

export const configPanel = document.createElement('div');
configPanel.className = 'tm-panel';
configPanel.style.cssText =
    'width:440px;max-width:95vw;padding:26px 24px;max-height:90vh;overflow-y:auto;';
configOverlay.appendChild(configPanel);

// ── DOM: Preview modal ────────────────────────────────────────────────────────
export const previewOverlay = document.createElement('div');
previewOverlay.className = 'tm-overlay';

export const previewPanel = document.createElement('div');
previewPanel.className = 'tm-panel';
previewPanel.style.cssText =
    'width:92vw;max-width:1100px;max-height:90vh;display:flex;flex-direction:column;';
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
export const clBtn = document.createElement('button');
clBtn.textContent = '🔗 Cross-link';
clBtn.style.cssText =
    'position:fixed;top:124px;right:20px;z-index:9999;' +
    'padding:6px 12px;border:none;border-radius:4px;cursor:pointer;' +
    'font-size:12px;font-weight:bold;background:#252540;color:#9ab;' +
    'box-shadow:0 2px 8px rgba(0,0,0,0.4);';

export const clOverlay = document.createElement('div');
clOverlay.className = 'tm-overlay';

export const clPanel = document.createElement('div');
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
    if (!msg) { el.style.display = 'none'; return; }
    el.style.display    = 'block';
    el.textContent      = msg;
    el.style.background = type === 'ok' ? '#1a3a1a' : type === 'err' ? '#3a1a1a' : '#2e2a00';
    el.style.color      = type === 'ok' ? '#6f6'    : type === 'err' ? '#f66'    : '#ffb';
}

export function setConfigStatus(msg, type) {
    applyStatus(configPanel.querySelector('#tm-config-status'), msg, type);
}
export function setPreviewStatus(msg, type) {
    applyStatus(previewPanel.querySelector('#tm-preview-status'), msg, type);
}

// ── Preview modal ─────────────────────────────────────────────────────────────
export function showPreview(episodes, subtitle) {
    // No global cap here — TVDB side caps inside doFillTvdb() (form limit = 25).
    // TMDB side can add any number of episodes one-by-one via Kendo DataSource.
    state.previewEpisodes = [...episodes];
    previewPanel.querySelector('#tm-preview-subtitle').textContent = subtitle;
    renderPreviewTable();
    setPreviewStatus('', '');
    previewOverlay.classList.add('active');
}

// Shift all episodes after `fromIdx` by the same day-delta as the moved episode.
// Called when the user commits a new air_date in the preview table.
// Episodes that had no date are left untouched.
function shiftSubsequentDates(fromIdx, oldDateStr, newDateStr) {
    if (fromIdx >= state.previewEpisodes.length - 1) return;
    if (!oldDateStr || !newDateStr) return;
    const delta = new Date(newDateStr + 'T00:00:00') - new Date(oldDateStr + 'T00:00:00');
    if (!delta) return;
    for (let i = fromIdx + 1; i < state.previewEpisodes.length; i++) {
        const ep = state.previewEpisodes[i];
        if (!ep.air_date) continue;
        const d = new Date(ep.air_date + 'T00:00:00');
        ep.air_date = toDateStr(new Date(d.getTime() + delta));
    }
    renderPreviewTable();
}

export function renderPreviewTable() {
    const tbody = previewPanel.querySelector('#tm-preview-body');
    tbody.innerHTML = '';
    state.previewEpisodes.forEach((ep, idx) => {
        const exists = !!ep._exists;
        const diff   = !!ep._diff;

        // Row status class: new / exists / diff
        const rowClass = diff ? 'tm-ep-diff' : exists ? 'tm-ep-exists' : '';

        // Badge shown in the # column
        const badge = diff
            ? '<span class="tm-ep-badge tm-ep-badge-diff">↑ ต่าง</span>'
            : exists
                ? '<span class="tm-ep-badge tm-ep-badge-exists">✓ มีแล้ว</span>'
                : '';

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
                if (inp.dataset.field !== 'episode_number') {
                    state.previewEpisodes[idx]._exists = false;
                    state.previewEpisodes[idx]._diff   = false;
                    tr.classList.remove('tm-ep-exists', 'tm-ep-diff');
                }
            });

            // When air_date is committed (date picker closed / Tab out),
            // shift all subsequent episodes by the same delta.
            if (inp.dataset.field === 'air_date') {
                let prevDate = ep.air_date; // captured at render time
                inp.addEventListener('change', () => {
                    if (inp.value && inp.value !== prevDate) {
                        shiftSubsequentDates(idx, prevDate, inp.value);
                        // prevDate is implicitly reset after re-render rebuilds the row
                    }
                });
            }
        });
        tr.querySelectorAll('.tm-move-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                syncFieldsFromDOM();
                const swap = btn.dataset.dir === 'up' ? idx - 1 : idx + 1;
                if (swap < 0 || swap >= state.previewEpisodes.length) return;
                [state.previewEpisodes[idx], state.previewEpisodes[swap]] =
                    [state.previewEpisodes[swap], state.previewEpisodes[idx]];
                renderPreviewTable();
            });
        });
        tbody.appendChild(tr);
    });
}

export function syncFieldsFromDOM() {
    previewPanel.querySelector('#tm-preview-body')
        .querySelectorAll('tr[data-idx]').forEach(tr => {
            const i = parseInt(tr.dataset.idx, 10);
            tr.querySelectorAll('.ep-field').forEach(inp => {
                state.previewEpisodes[i][inp.dataset.field] = inp.value;
            });
        });
}

// ── Cross-link: update hrefs after any ID change ──────────────────────────────
export function updateCrosslinks() {
    const tid   = pget('tmdb_id');
    const tSlug = pget('tvdb_slug');

    const tvdbEditLink = clPanel.querySelector('#cl-link-tvdb-edit');
    const tmdbExtLink  = clPanel.querySelector('#cl-link-tmdb-ext');

    if (tvdbEditLink) {
        tvdbEditLink.href         = tSlug ? `https://www.thetvdb.com/series/${tSlug}/edit` : '#';
        tvdbEditLink.style.opacity = tSlug ? '1' : '0.4';
    }
    if (tmdbExtLink) {
        tmdbExtLink.href         = tid ? `https://www.themoviedb.org/tv/${tid}/edit?active_nav_item=external_ids` : '#';
        tmdbExtLink.style.opacity = tid ? '1' : '0.4';
    }
}
