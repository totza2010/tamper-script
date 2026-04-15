// ==UserScript==
// @name         TMDB to TVDB Episode Filler
// @namespace    https://tampermonkey.net/
// @version      2.0
// @description  Fetch episode data from TMDB and auto-fill TVDB bulk add form with preview/reorder
// @author       You
// @match        https://www.thetvdb.com/series/*/seasons/official/*/bulkadd
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      api.themoviedb.org
// ==/UserScript==

(function () {
    'use strict';

    const MAX_ROWS = 25;

    // Auto-detect season from URL
    const urlMatch = window.location.pathname.match(/\/seasons\/official\/(\d+)\/bulkadd/);
    const urlSeason = urlMatch ? urlMatch[1] : '1';

    // ── Helper: get starting episode number from the form ────────────────────
    function getFormStartEpisode() {
        const firstNumInput = document.querySelector('fieldset.noformat input[name="number[]"]');
        if (!firstNumInput) return 1;
        const v = parseInt(firstNumInput.value, 10);
        return isNaN(v) ? 1 : v;
    }

    // ── Styles ───────────────────────────────────────────────────────────────
    const style = document.createElement('style');
    style.textContent = `
        .tm-overlay {
            display: none; position: fixed; inset: 0;
            background: rgba(0,0,0,0.7); z-index: 10000;
            justify-content: center; align-items: center;
        }
        .tm-overlay.active { display: flex; }
        .tm-panel {
            background: #1a1a2e; color: #e0e0e0;
            border-radius: 10px; box-shadow: 0 6px 28px rgba(0,0,0,0.6);
            font-family: sans-serif; overflow: hidden;
        }
        .tm-panel input, .tm-panel textarea, .tm-panel select {
            width: 100%; padding: 7px 9px; box-sizing: border-box;
            background: #2a2a3e; border: 1px solid #555; color: #eee;
            border-radius: 4px; font-size: 13px;
        }
        .tm-panel input:focus, .tm-panel textarea:focus {
            border-color: #01b4e4; outline: none;
        }
        .tm-label {
            display: block; margin-bottom: 4px;
            font-size: 12px; color: #9ab;
        }
        .tm-field { margin-bottom: 13px; }
        .tm-btn {
            padding: 8px 18px; border: none; border-radius: 4px;
            cursor: pointer; font-size: 13px; font-weight: bold;
        }
        .tm-btn-primary { background: #01b4e4; color: #fff; }
        .tm-btn-primary:hover { background: #02c8ff; }
        .tm-btn-secondary { background: #3a3a55; color: #ccc; }
        .tm-btn-secondary:hover { background: #4a4a6a; }
        .tm-btn-success { background: #1a8a3a; color: #fff; }
        .tm-btn-success:hover { background: #22aa48; }
        .tm-status {
            display: none; padding: 8px 10px;
            border-radius: 4px; font-size: 13px; margin-bottom: 13px;
        }
        /* Preview table */
        .tm-preview-table {
            width: 100%; border-collapse: collapse; font-size: 12px;
        }
        .tm-preview-table th {
            background: #252540; color: #9ab; font-weight: 600;
            padding: 7px 8px; text-align: left; position: sticky; top: 0;
        }
        .tm-preview-table td {
            padding: 5px 8px; border-bottom: 1px solid #2a2a45; vertical-align: middle;
        }
        .tm-preview-table tr:hover td { background: #22223a; }
        .tm-preview-table input, .tm-preview-table textarea {
            background: #2a2a3e; border: 1px solid #444; color: #eee;
            border-radius: 3px; padding: 3px 5px; font-size: 12px;
            width: 100%; box-sizing: border-box;
        }
        .tm-preview-table textarea { resize: vertical; min-height: 44px; }
        .tm-move-btn {
            background: #3a3a55; color: #aaa; border: none;
            border-radius: 3px; cursor: pointer; padding: 2px 6px;
            font-size: 13px; line-height: 1.4;
        }
        .tm-move-btn:hover { background: #5a5a7a; color: #fff; }
        .tm-move-btn:disabled { opacity: 0.3; cursor: default; }
        .ep-num-cell { text-align: center; color: #01b4e4; font-weight: bold; }
    `;
    document.head.appendChild(style);

    // ── Floating trigger button ──────────────────────────────────────────────
    const triggerBtn = document.createElement('button');
    triggerBtn.className = 'tm-btn tm-btn-primary';
    triggerBtn.textContent = '▶ Fetch from TMDB';
    triggerBtn.style.cssText = `
        position: fixed; top: 80px; right: 20px; z-index: 9999;
        box-shadow: 0 2px 10px rgba(0,0,0,0.4); font-size: 14px;
    `;
    document.body.appendChild(triggerBtn);

    // ══════════════════════════════════════════════════════════════════════════
    // FETCH MODAL
    // ══════════════════════════════════════════════════════════════════════════
    const fetchOverlay = document.createElement('div');
    fetchOverlay.className = 'tm-overlay';

    const fetchPanel = document.createElement('div');
    fetchPanel.className = 'tm-panel';
    fetchPanel.style.cssText = 'width:400px;max-width:94vw;padding:26px 24px;';
    fetchPanel.innerHTML = `
        <h3 style="margin:0 0 18px;color:#01b4e4;font-size:17px">Fetch Episodes from TMDB</h3>

        <div class="tm-field">
            <label class="tm-label">TMDB API Key (v3)</label>
            <input id="tm-key" type="password" placeholder="Paste your TMDB v3 API key">
        </div>
        <div class="tm-field">
            <label class="tm-label">TMDB Show ID</label>
            <input id="tm-show" type="text" placeholder="e.g. 17454">
        </div>
        <div class="tm-field">
            <label class="tm-label">Season Number</label>
            <input id="tm-season" type="number" value="${urlSeason}" min="1">
        </div>
        <div class="tm-field">
            <label class="tm-label">Language</label>
            <input id="tm-lang" type="text" value="en-US" placeholder="en-US / th-TH / zh-TW">
            <p style="margin:4px 0 0;font-size:11px;color:#666">
                Affects episode names & overviews from TMDB.
            </p>
        </div>

        <div id="tm-fetch-status" class="tm-status"></div>

        <div style="display:flex;gap:10px;justify-content:flex-end">
            <button id="tm-cancel" class="tm-btn tm-btn-secondary">Cancel</button>
            <button id="tm-go" class="tm-btn tm-btn-primary">Fetch Episodes</button>
        </div>
    `;
    fetchOverlay.appendChild(fetchPanel);
    document.body.appendChild(fetchOverlay);

    // Restore saved key
    const savedKey = GM_getValue('tmdb_apikey', '');
    if (savedKey) fetchPanel.querySelector('#tm-key').value = savedKey;

    // Restore saved show ID
    const savedShowId = GM_getValue('tmdb_showid', '');
    if (savedShowId) fetchPanel.querySelector('#tm-show').value = savedShowId;

    // ══════════════════════════════════════════════════════════════════════════
    // PREVIEW MODAL
    // ══════════════════════════════════════════════════════════════════════════
    const previewOverlay = document.createElement('div');
    previewOverlay.className = 'tm-overlay';

    const previewPanel = document.createElement('div');
    previewPanel.className = 'tm-panel';
    previewPanel.style.cssText = `
        width: 92vw; max-width: 1100px;
        max-height: 90vh; display: flex; flex-direction: column;
    `;
    previewPanel.innerHTML = `
        <div style="padding:18px 20px 14px;border-bottom:1px solid #2a2a45;flex-shrink:0">
            <h3 style="margin:0;color:#01b4e4;font-size:17px">Preview &amp; Confirm Episodes</h3>
            <p id="tm-preview-subtitle" style="margin:6px 0 0;font-size:12px;color:#88a"></p>
        </div>
        <div style="overflow-y:auto;flex:1;padding:0 0 4px">
            <table class="tm-preview-table">
                <thead>
                    <tr>
                        <th style="width:36px">#</th>
                        <th style="width:34px">Ep</th>
                        <th style="width:200px">Name</th>
                        <th>Overview</th>
                        <th style="width:114px">Air Date</th>
                        <th style="width:70px">Runtime</th>
                        <th style="width:52px">Move</th>
                    </tr>
                </thead>
                <tbody id="tm-preview-body"></tbody>
            </table>
        </div>
        <div id="tm-preview-status" class="tm-status" style="margin:10px 16px 0;"></div>
        <div style="padding:14px 16px;border-top:1px solid #2a2a45;display:flex;gap:10px;justify-content:flex-end;flex-shrink:0">
            <button id="tm-preview-back" class="tm-btn tm-btn-secondary">← Back</button>
            <button id="tm-preview-confirm" class="tm-btn tm-btn-success">✔ Confirm &amp; Fill Form</button>
        </div>
    `;
    previewOverlay.appendChild(previewPanel);
    document.body.appendChild(previewOverlay);

    // ── Event wiring ─────────────────────────────────────────────────────────
    triggerBtn.addEventListener('click', () => {
        setFetchStatus('', '');
        fetchOverlay.classList.add('active');
    });

    fetchPanel.querySelector('#tm-cancel').addEventListener('click', () => {
        fetchOverlay.classList.remove('active');
    });
    fetchOverlay.addEventListener('click', e => {
        if (e.target === fetchOverlay) fetchOverlay.classList.remove('active');
    });

    fetchPanel.querySelector('#tm-go').addEventListener('click', doFetch);

    previewPanel.querySelector('#tm-preview-back').addEventListener('click', () => {
        previewOverlay.classList.remove('active');
        fetchOverlay.classList.add('active');
    });
    previewOverlay.addEventListener('click', e => {
        if (e.target === previewOverlay) previewOverlay.classList.remove('active');
    });

    previewPanel.querySelector('#tm-preview-confirm').addEventListener('click', doFill);

    // ── Status helpers ────────────────────────────────────────────────────────
    function setFetchStatus(msg, type) {
        const el = fetchPanel.querySelector('#tm-fetch-status');
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

    // ── Fetch from TMDB ───────────────────────────────────────────────────────
    function doFetch() {
        const apiKey = fetchPanel.querySelector('#tm-key').value.trim();
        const showId = fetchPanel.querySelector('#tm-show').value.trim();
        const season = fetchPanel.querySelector('#tm-season').value.trim();
        const lang = fetchPanel.querySelector('#tm-lang').value.trim() || 'en-US';

        if (!apiKey || !showId || !season) {
            setFetchStatus('Please fill in API Key, Show ID, and Season.', 'err');
            return;
        }

        GM_setValue('tmdb_apikey', apiKey);
        GM_setValue('tmdb_showid', showId);
        setFetchStatus('Fetching from TMDB…', 'warn');

        const url = `https://api.themoviedb.org/3/tv/${encodeURIComponent(showId)}/season/${encodeURIComponent(season)}?api_key=${encodeURIComponent(apiKey)}&language=${encodeURIComponent(lang)}`;

        GM_xmlhttpRequest({
            method: 'GET',
            url,
            onload(res) {
                if (res.status !== 200) {
                    setFetchStatus(`TMDB error: HTTP ${res.status}. Check API key / Show ID.`, 'err');
                    return;
                }
                let data;
                try { data = JSON.parse(res.responseText); }
                catch (_) { setFetchStatus('Failed to parse TMDB response.', 'err'); return; }

                const allEpisodes = data.episodes;
                if (!allEpisodes || !allEpisodes.length) {
                    setFetchStatus('No episodes returned. Check Show ID and season.', 'err');
                    return;
                }

                // Determine starting episode from form
                const startEp = getFormStartEpisode();

                // Find episodes starting from startEp, up to MAX_ROWS
                const startIdx = allEpisodes.findIndex(e => e.episode_number >= startEp);
                if (startIdx === -1) {
                    setFetchStatus(`No TMDB episode found with episode number ≥ ${startEp}.`, 'err');
                    return;
                }
                const sliced = allEpisodes.slice(startIdx, startIdx + MAX_ROWS);

                setFetchStatus('', '');
                fetchOverlay.classList.remove('active');
                showPreview(sliced, startEp, allEpisodes.length);
            },
            onerror() {
                setFetchStatus('Network error. Check API key and internet connection.', 'err');
            }
        });
    }

    // ── Preview modal ─────────────────────────────────────────────────────────
    // We store the editable episode list as an array of objects in memory.
    let previewEpisodes = [];

    function showPreview(episodes, startEp, totalInSeason) {
        previewEpisodes = episodes.map(ep => ({
            episode_number: ep.episode_number,
            name: ep.name || '',
            overview: ep.overview || '',
            air_date: ep.air_date || '',
            runtime: ep.runtime != null ? String(ep.runtime) : '',
        }));

        const subtitle = previewPanel.querySelector('#tm-preview-subtitle');
        subtitle.textContent =
            `Form starts at episode ${startEp} · Showing ${previewEpisodes.length} of ${totalInSeason} episodes (TVDB limit: ${MAX_ROWS})`;

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
                <td>
                    <input type="text" class="ep-field" data-field="name" value="${escHtml(ep.name)}" maxlength="100">
                </td>
                <td>
                    <textarea class="ep-field" data-field="overview" rows="2" maxlength="1000">${escHtml(ep.overview)}</textarea>
                </td>
                <td>
                    <input type="date" class="ep-field" data-field="air_date" value="${ep.air_date}">
                </td>
                <td>
                    <input type="number" class="ep-field" data-field="runtime" value="${ep.runtime}" min="0" style="width:60px">
                </td>
                <td style="white-space:nowrap">
                    <button class="tm-move-btn" data-dir="up"   title="Move up"  ${idx === 0 ? 'disabled' : ''}>▲</button>
                    <button class="tm-move-btn" data-dir="down" title="Move down" ${idx === previewEpisodes.length - 1 ? 'disabled' : ''}>▼</button>
                </td>
            `;

            // Sync edits back to previewEpisodes
            tr.querySelectorAll('.ep-field').forEach(input => {
                input.addEventListener('input', () => {
                    previewEpisodes[idx][input.dataset.field] = input.value;
                });
            });

            // Move buttons
            tr.querySelectorAll('.tm-move-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    syncFieldsFromDOM(); // save current edits before reorder
                    const dir = btn.dataset.dir;
                    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
                    if (swapIdx < 0 || swapIdx >= previewEpisodes.length) return;
                    [previewEpisodes[idx], previewEpisodes[swapIdx]] =
                        [previewEpisodes[swapIdx], previewEpisodes[idx]];
                    renderPreviewTable();
                });
            });

            tbody.appendChild(tr);
        });
    }

    // Read all current DOM input values back into previewEpisodes before reorder
    function syncFieldsFromDOM() {
        const tbody = previewPanel.querySelector('#tm-preview-body');
        tbody.querySelectorAll('tr[data-idx]').forEach(tr => {
            const i = parseInt(tr.dataset.idx, 10);
            tr.querySelectorAll('.ep-field').forEach(input => {
                previewEpisodes[i][input.dataset.field] = input.value;
            });
        });
    }

    // ── Fill the TVDB form ────────────────────────────────────────────────────
    function doFill() {
        syncFieldsFromDOM();

        const fieldset = document.querySelector('fieldset.noformat');
        if (!fieldset) {
            setPreviewStatus('Could not find the TVDB bulk-add form.', 'err');
            return;
        }

        const addBtn = fieldset.querySelector('button.multirow-add');
        let rows = getRows(fieldset);

        // Add rows until we have enough (up to MAX_ROWS)
        const needed = Math.min(previewEpisodes.length, MAX_ROWS);
        let attempts = 0;
        while (rows.length < needed && addBtn && attempts < 30) {
            addBtn.click();
            rows = getRows(fieldset);
            attempts++;
        }

        previewEpisodes.forEach((ep, i) => {
            if (i >= rows.length || i >= MAX_ROWS) return;
            const row = rows[i];
            setVal(row, 'input[name="number[]"]', ep.episode_number);
            setVal(row, 'input[name="name[]"]', ep.name);
            setVal(row, 'textarea[name="overview[]"]', ep.overview);
            setVal(row, 'input[name="date[]"]', ep.air_date);
            setVal(row, 'input[name="runtime[]"]', ep.runtime);
        });

        setPreviewStatus(`Done! Filled ${needed} episode(s) into the form.`, 'ok');
        setTimeout(() => {
            previewOverlay.classList.remove('active');
            setPreviewStatus('', '');
        }, 1800);
    }

    // ── Utilities ─────────────────────────────────────────────────────────────
    function getRows(fieldset) {
        return Array.from(fieldset.querySelectorAll('.multirow-item'));
    }

    function setVal(row, selector, value) {
        const el = row.querySelector(selector);
        if (!el) return;
        el.value = value ?? '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

})();
