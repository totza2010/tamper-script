"use strict";

import { apiReq } from "./api.js";
import { setSpData } from "./state.js";
import { showToast } from "./utils.js";
import { showUnmatchedPanel, getBreakdown } from "./unmatched.js";

// ── Persistence ───────────────────────────────────────────────────────────────
// entry: { seriesId, count, allHandled, title, titleSlug, path }

const CACHE_KEY   = `lib_unm_${location.hostname}`;
const CONCURRENCY = 5;

function saveCache() {
    GM_setValue(CACHE_KEY, JSON.stringify({
        ts:      Date.now(),
        entries: [..._cache.values()],
    }));
}

function loadCache() {
    try {
        const raw = GM_getValue(CACHE_KEY, null);
        if (!raw) return;
        const { ts, entries } = JSON.parse(raw);
        _cache.clear();
        (entries ?? []).forEach(e => _cache.set(e.seriesId, e));
        _scanTime = ts;
    } catch { /* ignore corrupt cache */ }
}

// ── Runtime state ─────────────────────────────────────────────────────────────
const _cache  = new Map();
let _scanTime        = null;
let _scanning        = false;
let _done            = 0;
let _total           = 0;
let _totalSeriesCount = 0;   // total series in Sonarr (shown in subhead)

let _badgeObs      = null;
let _badgeDebounce = null;

// ── Unified fetch watcher ─────────────────────────────────────────────────────
// Intercepts window.fetch once and dispatches to registered handlers.

const _mutationWatchers = new Set();   // callbacks registered by other modules
let   _fetchInstalled   = false;
let   _newSeriesTimer   = null;

export function registerSeriesMutationWatch(fn) {
    _mutationWatchers.add(fn);
    _installFetchWatcher();
}

function _installFetchWatcher() {
    if (_fetchInstalled) return;
    _fetchInstalled = true;

    const origFetch = window.fetch;
    window.fetch = function (input, init, ...rest) {
        const p = origFetch.call(this, input, init, ...rest);
        p.then(async res => {
            try {
                const method = (init?.method ?? "GET").toUpperCase();
                const url    = typeof input === "string" ? input
                             : (input instanceof URL   ? input.href
                             : input?.url ?? "");

                if (!["PUT", "POST", "DELETE"].includes(method)) return;
                if (!/\/api\/v3\//.test(url))                     return;

                // ── New series added → auto-scan just that series ─────────────
                if (method === "POST" && /\/api\/v3\/series$/.test(url)) {
                    try {
                        const clone = res.clone();
                        const data  = await clone.json();
                        if (data?.id) {
                            clearTimeout(_newSeriesTimer);
                            // wait 8 s for Sonarr to finish initial scan
                            _newSeriesTimer = setTimeout(() => _scanSingleSeries(data), 8000);
                        }
                    } catch { /* ignore parse errors */ }
                    return;
                }

                // ── Sonarr scheduled-scan / rescan command ────────────────────
                if (method === "POST" && /\/api\/v3\/command$/.test(url)) {
                    try {
                        const clone = res.clone();
                        const data  = await clone.json();
                        const name  = (data?.name ?? "").toLowerCase();
                        if (/rescan|refresh/.test(name) && data?.seriesId) {
                            clearTimeout(_newSeriesTimer);
                            _newSeriesTimer = setTimeout(async () => {
                                try {
                                    const series = await apiReq("GET", `/api/v3/series/${data.seriesId}`);
                                    await _scanSingleSeries(series);
                                } catch { /* ignore */ }
                            }, 5000);
                        }
                    } catch { /* ignore */ }
                    return;
                }

                // ── Generic mutation on a series page → notify watchers ───────
                if (/^\/series\/[^/]+/.test(location.pathname)) {
                    _mutationWatchers.forEach(fn => {
                        try { fn(); } catch { /* ignore */ }
                    });
                }
            } catch { /* ignore top-level errors */ }
        });
        return p;
    };
}

// ── Library page detection ─────────────────────────────────────────────────────
export function isLibraryPage() {
    return /^\/(series)?\/?$/.test(location.pathname);
}

// ── One-time global FAB init — called once at script startup ──────────────────
export function initLibraryFab() {
    loadCache();
    _getOrCreateFab().classList.add("visible");
    _refreshFabBadge();
    _installFetchWatcher();   // start the unified watcher immediately
}

// ── Called from series page after checkUnmatchedFiles() ──────────────────────
export function updateCacheEntry(series, count, allHandled = false, unclassified = count, breakdown = null) {
    if (count > 0) {
        _cache.set(series.id, {
            seriesId:     series.id,
            count,
            allHandled,
            unclassified,
            breakdown:    breakdown ?? { multipart: 0, version: 0, ignore: 0, delete: 0, unclassified: count },
            title:        series.title,
            titleSlug:    series.titleSlug,
            path:         series.path,
        });
    } else {
        _cache.delete(series.id);
    }
    saveCache();
    _refreshFabBadge();
    _refreshPanelRow(series.id, count, series.title, series.titleSlug);
}

// ── Alert toast — floating top-centre on series pages ────────────────────────
// onRecheck: optional callback — wired to the ↺ Re-check button
export function showSeriesAlert(series, count, allHandled, onRecheck) {
    hideSeriesAlert();

    const isYellow = allHandled;
    const label = isYellow
        ? `📁 ${count} unmatched file${count !== 1 ? "s" : ""} — all classified (multi / ignore)`
        : `📁 ${count} unmatched file${count !== 1 ? "s" : ""} with no episode match`;

    const bar = document.createElement("div");
    bar.id = "lib-scan-alert";

    // ── Inline styles — override everything, guaranteed above Sonarr's CSS ────
    Object.assign(bar.style, {
        position:      "fixed",
        top:           "72px",
        left:          "50%",
        transform:     "translateX(-50%)",
        zIndex:        "99999",
        display:       "flex",
        alignItems:    "center",
        gap:           "10px",
        padding:       "11px 16px 11px 18px",
        borderRadius:  "10px",
        fontFamily:    "sans-serif",
        fontSize:      "13px",
        fontWeight:    "500",
        whiteSpace:    "nowrap",
        boxShadow:     "0 6px 24px rgba(0,0,0,.7), 0 2px 8px rgba(0,0,0,.5)",
        background:    isYellow ? "#1e1600" : "#220808",
        border:        isYellow ? "1px solid #906000" : "1px solid #b01818",
        color:         isYellow ? "#e8c84a" : "#f09090",
        pointerEvents: "all",
        userSelect:    "none",
        animation:     "lib-alert-drop .22s cubic-bezier(.2,.8,.3,1) both",
    });

    const btnBase = `padding:3px 10px; border-radius:6px; cursor:pointer;
        border:1px solid currentColor; background:transparent;
        color:inherit; font-size:11px; font-weight:bold;`;

    bar.innerHTML = `
        <span>${label}</span>
        <button id="lib-alert-view" style="${btnBase}">View files ↗</button>
        ${onRecheck ? `<button id="lib-alert-recheck" style="${btnBase}">↺ Re-check</button>` : ""}
        <button id="lib-alert-close" title="Dismiss" style="
            padding:2px 7px; border:none; background:transparent;
            color:#789; font-size:15px; cursor:pointer; line-height:1;">✕</button>`;

    bar.querySelector("#lib-alert-view").addEventListener("click", () => showUnmatchedPanel());
    bar.querySelector("#lib-alert-close").addEventListener("click", () => hideSeriesAlert());

    if (onRecheck) {
        const recheckBtn = bar.querySelector("#lib-alert-recheck");
        recheckBtn.addEventListener("click", async () => {
            recheckBtn.textContent = "↺ Checking…";
            recheckBtn.disabled    = true;
            await onRecheck();
            // onRecheck calls showSeriesAlert again (or hideSeriesAlert) — this bar is replaced
        });
    }

    document.body.appendChild(bar);
}

export function hideSeriesAlert() {
    document.getElementById("lib-scan-alert")?.remove();
}

// ── Library page init ─────────────────────────────────────────────────────────
export function initLibraryScan() {
    _getOrCreateFab().classList.add("visible");
    _refreshFabBadge();
    injectBadges();
    _startBadgeObserver();
    if (_cache.size > 0) showPanel();
}

// ── Cleanup when leaving library page ────────────────────────────────────────
// FAB stays visible on all pages — only disconnect the badge observer.
export function cleanupLibraryScan() {
    document.getElementById("lib-scan-panel")?.classList.remove("open");
    _badgeObs?.disconnect();
    _badgeObs = null;
    clearTimeout(_badgeDebounce);
}

// ── FAB button ────────────────────────────────────────────────────────────────

function _getOrCreateFab() {
    let fab = document.getElementById("lib-scan-fab");
    if (fab) return fab;

    fab = document.createElement("div");
    fab.id          = "lib-scan-fab";
    fab.className   = "rg-fab-side";
    fab.title       = "Unmatched files in library";
    fab.textContent = "📁";
    fab.addEventListener("click", () => {
        const panel = document.getElementById("lib-scan-panel");
        if (panel?.classList.contains("open")) panel.classList.remove("open");
        else showPanel();
    });
    document.body.appendChild(fab);
    return fab;
}

function _refreshFabBadge() {
    const fab = document.getElementById("lib-scan-fab");
    if (!fab) return;

    let badge = fab.querySelector(".lib-fab-badge");
    const count = _cache.size;

    if (count > 0) {
        if (!badge) {
            badge = document.createElement("span");
            badge.className = "lib-fab-badge";
            fab.appendChild(badge);
        }
        badge.textContent = count;
    } else {
        badge?.remove();
    }
}

// ── Panel ─────────────────────────────────────────────────────────────────────

function showPanel() {
    let panel = document.getElementById("lib-scan-panel");
    if (panel) { panel.classList.add("open"); return; }

    panel = document.createElement("div");
    panel.id = "lib-scan-panel";
    panel.innerHTML = `
        <div class="lsp-head">
            <span class="lsp-title">📁 Unmatched Files</span>
            <div class="lsp-head-right">
                <button class="lsp-scan-btn">▶ Scan all</button>
                <button class="lsp-close" title="Close">✕</button>
            </div>
        </div>
        <div class="lsp-subhead" id="lib-scan-subhead"></div>
        <div class="lsp-body">
            <div class="lsp-list"  id="lib-scan-list"></div>
            <p   class="lsp-empty" id="lib-scan-empty"></p>
        </div>`;

    document.body.appendChild(panel);
    requestAnimationFrame(() => panel.classList.add("open"));

    panel.querySelector(".lsp-close").addEventListener("click",
        () => panel.classList.remove("open"));
    panel.querySelector(".lsp-scan-btn").addEventListener("click",
        () => startScan());

    // Delegated handler for both "open series" and "view unmatched" clicks
    panel.querySelector(".lsp-list").addEventListener("click", e => {
        // ↗ navigate to series page
        const openBtn = e.target.closest(".lsp-open-btn");
        if (openBtn) {
            e.stopPropagation();
            const slug = openBtn.dataset.slug;
            if (slug) {
                panel.classList.remove("open");
                history.pushState(null, "", `/series/${slug}`);
                window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
            }
            return;
        }
        // clicking the row body → open unmatched panel
        const row = e.target.closest(".lsp-series-btn");
        if (row) _openSeriesPanel(parseInt(row.dataset.id));
    });

    [..._cache.values()].forEach(_appendRow);
    _updateSubhead();
}

function _updateSubhead() {
    const el = document.getElementById("lib-scan-subhead");
    if (!el) return;

    const scanBtn = document.querySelector(".lsp-scan-btn");

    if (_scanning) {
        el.className   = "lsp-subhead lsp-subhead--scanning";
        el.textContent = _total > 0 ? `Scanning ${_done} / ${_total}…` : "Connecting…";
        if (scanBtn) { scanBtn.disabled = true; scanBtn.textContent = "Scanning…"; }
        return;
    }

    if (scanBtn) { scanBtn.disabled = false; scanBtn.textContent = _scanTime ? "↺ Re-scan" : "▶ Scan all"; }

    const count = _cache.size;
    const stamp = _scanTime ? ` · ${_timeAgo(_scanTime)}` : "";

    const totalSuffix = _totalSeriesCount > 0 ? ` · ${_totalSeriesCount} total series` : "";

    if (count > 0) {
        el.className   = "lsp-subhead lsp-subhead--warn";
        el.textContent = `${count} series with unmatched files${stamp}${totalSuffix}`;
    } else if (_scanTime) {
        el.className   = "lsp-subhead lsp-subhead--ok";
        el.textContent = `All files matched ✓${stamp}${totalSuffix}`;
    } else {
        el.className   = "lsp-subhead";
        el.textContent = _totalSeriesCount > 0
            ? `${_totalSeriesCount} series — press ▶ Scan all to check.`
            : "Press ▶ Scan all to check all series.";
    }

    const empty = document.getElementById("lib-scan-empty");
    if (empty) empty.textContent = count === 0 && _scanTime
        ? "No unmatched files found in any series folder."
        : "";
}

function _rowStatusHtml(entry) {
    const bd = entry.breakdown ?? {};
    const unclassified = bd.unclassified ?? (entry.unclassified ?? entry.count);
    const multipart    = bd.multipart ?? 0;
    const version      = bd.version   ?? 0;
    const ignore       = bd.ignore    ?? 0;
    const del          = bd.delete    ?? 0;

    const parts = [];

    // Warning first — unclassified files that need human action
    if (unclassified > 0) {
        parts.push(`<span class="lsp-tag lsp-tag--warn">⚠ ${unclassified} unclassified</span>`);
    }
    // Classified types — show only non-zero
    if (multipart > 0) parts.push(`<span class="lsp-tag lsp-tag--info">📼 ${multipart} multi-part</span>`);
    if (version   > 0) parts.push(`<span class="lsp-tag lsp-tag--info">🔀 ${version} version</span>`);
    if (ignore    > 0) parts.push(`<span class="lsp-tag lsp-tag--dim">👁 ${ignore} ignore</span>`);
    if (del       > 0) parts.push(`<span class="lsp-tag lsp-tag--dim">🗑 ${del} delete</span>`);

    if (parts.length === 0) {
        // Fallback — should not happen, but safe
        return `<span class="lsp-tag lsp-tag--ok">✓ ${entry.count} file${entry.count !== 1 ? "s" : ""}</span>`;
    }
    return parts.join("");
}

function _appendRow(entry) {
    const list = document.getElementById("lib-scan-list");
    if (!list) return;
    if (list.querySelector(`[data-id="${entry.seriesId}"]`)) return;

    const row = document.createElement("div");
    row.className    = "lsp-series-btn";
    row.dataset.id   = entry.seriesId;
    row.dataset.slug = entry.titleSlug ?? "";
    row.innerHTML = `
        <div class="lsp-series-info">
            <span class="lsp-series-title">${_esc(entry.title)}</span>
            <div class="lsp-series-tags">${_rowStatusHtml(entry)}</div>
        </div>
        <button class="lsp-open-btn" data-slug="${_esc(entry.titleSlug ?? "")}" title="Open series page">↗</button>`;
    list.appendChild(row);
}

function _refreshPanelRow(seriesId, count, title, titleSlug) {
    const list = document.getElementById("lib-scan-list");
    if (!list) return;

    const existing = list.querySelector(`[data-id="${seriesId}"]`);
    const entry = _cache.get(seriesId);   // may be undefined if just deleted

    if (count > 0 && entry) {
        if (existing) {
            existing.querySelector(".lsp-series-tags").innerHTML = _rowStatusHtml(entry);
        } else {
            _appendRow(entry);
        }
    } else {
        existing?.remove();
    }
    _updateSubhead();
}

function _clearPanelList() {
    const list  = document.getElementById("lib-scan-list");
    const empty = document.getElementById("lib-scan-empty");
    if (list)  list.innerHTML    = "";
    if (empty) empty.textContent = "";
}

// ── Scan (limited concurrency — user-triggered only) ──────────────────────────

async function startScan() {
    if (_scanning) return;
    _scanning = true;
    _done = _total = 0;
    _cache.clear();
    _clearPanelList();
    _updateSubhead();

    try {
        const allSeries = await apiReq("GET", "/api/v3/series");
        const active = allSeries.filter(s => s.path);
        _totalSeriesCount = allSeries.length;
        _total = active.length;
        _updateSubhead();

        let idx = 0;
        async function worker() {
            while (idx < active.length) {
                const series = active[idx++];
                try {
                    const items = await apiReq("GET",
                        `/api/v3/manualimport?seriesId=${series.id}` +
                        `&folder=${encodeURIComponent(series.path)}` +
                        `&filterExistingFiles=true&sortKey=relativePath&sortDirection=ascending`
                    );
                    const unmatchedItems = items.filter(it => !(it.episodes?.length > 0));
                    const count = unmatchedItems.length;
                    if (count > 0) {
                        const breakdown    = getBreakdown(series.id, unmatchedItems);
                        const unclassified = breakdown.unclassified;
                        const entry = {
                            seriesId:     series.id,
                            count,
                            allHandled:   unclassified === 0,
                            unclassified,
                            breakdown,
                            title:        series.title,
                            titleSlug:    series.titleSlug,
                            path:         series.path,
                        };
                        _cache.set(series.id, entry);
                        _appendRow(entry);
                        injectBadgeForSlug(series.titleSlug, count, series.id);
                    }
                } catch { /* skip failed series */ }
                _done++;
                _updateSubhead();
            }
        }

        await Promise.all(Array.from({ length: CONCURRENCY }, worker));

        _scanTime = Date.now();
        _scanning = false;
        saveCache();
        _refreshFabBadge();
        _updateSubhead();
        _startBadgeObserver();

    } catch (e) {
        _scanning = false;
        console.warn("[RG Library Scan]", e.message);
        _updateSubhead();
    }
}

// ── Scan a single series (called after new-series API or rescan command) ──────
// Updates the cache and panel row, does NOT do a full scan.

async function _scanSingleSeries(series) {
    if (!series?.id || !series?.path) return;
    try {
        const items = await apiReq("GET",
            `/api/v3/manualimport?seriesId=${series.id}` +
            `&folder=${encodeURIComponent(series.path)}` +
            `&filterExistingFiles=true&sortKey=relativePath&sortDirection=ascending`
        );
        const unmatchedItems = items.filter(it => !(it.episodes?.length > 0));
        const count = unmatchedItems.length;
        if (count > 0) {
            const breakdown    = getBreakdown(series.id, unmatchedItems);
            const unclassified = breakdown.unclassified;
            const entry = {
                seriesId:  series.id,
                count,
                allHandled: unclassified === 0,
                unclassified,
                breakdown,
                title:     series.title,
                titleSlug: series.titleSlug,
                path:      series.path,
            };
            _cache.set(series.id, entry);
            _appendRow(entry);
            if (isLibraryPage()) injectBadgeForSlug(series.titleSlug, count, series.id);
        } else {
            _cache.delete(series.id);
            _refreshPanelRow(series.id, 0, series.title, series.titleSlug);
        }
        saveCache();
        _refreshFabBadge();
        _updateSubhead();
    } catch (e) {
        console.warn("[RG Library Scan] _scanSingleSeries:", e.message);
    }
}

// ── Open series unmatched panel ────────────────────────────────────────────────
// Fetches fresh data on-demand; also refreshes the cache if count changed.

async function _openSeriesPanel(seriesId) {
    const entry = _cache.get(seriesId);
    if (!entry) return;

    showToast(`Loading ${entry.title}…`);

    try {
        const [series, items, files, episodes] = await Promise.all([
            apiReq("GET", `/api/v3/series/${seriesId}`),
            apiReq("GET",
                `/api/v3/manualimport?seriesId=${seriesId}` +
                `&folder=${encodeURIComponent(entry.path)}` +
                `&filterExistingFiles=true&sortKey=relativePath&sortDirection=ascending`
            ),
            apiReq("GET", `/api/v3/episodefile?seriesId=${seriesId}`),
            apiReq("GET", `/api/v3/episode?seriesId=${seriesId}`),
        ]);

        // Refresh cache with the latest count — series may have been re-matched
        const freshCount = items.filter(it => !(it.episodes?.length > 0)).length;
        if (freshCount !== entry.count || freshCount === 0) {
            if (freshCount === 0) {
                _cache.delete(seriesId);
            } else {
                _cache.set(seriesId, { ...entry, count: freshCount });
            }
            saveCache();
            _refreshFabBadge();
            _refreshPanelRow(seriesId, freshCount, series.title, series.titleSlug);
        }

        const epMap = new Map();
        episodes.filter(e => e.episodeFileId).forEach(e => {
            const arr = epMap.get(e.episodeFileId);
            if (arr) arr.push(e);
            else epMap.set(e.episodeFileId, [e]);
        });
        epMap.forEach(arr => arr.sort((a, b) =>
            a.seasonNumber !== b.seasonNumber
                ? a.seasonNumber - b.seasonNumber
                : a.episodeNumber - b.episodeNumber
        ));

        setSpData({ series, files, epMap, unmatchedFiles: items });
        showUnmatchedPanel();

    } catch (e) {
        console.warn("[RG Library Scan] openSeriesPanel:", e.message);
        showToast(`Error: ${e.message}`);
    }
}

// ── Badge injection on series poster cards ────────────────────────────────────

export function injectBadgeForSlug(slug, count, seriesId) {
    document.querySelectorAll(`a[href='/series/${slug}']`).forEach(link => {
        if (link.querySelector(".lib-unm-badge")) return;
        const badge = document.createElement("div");
        badge.className        = "lib-unm-badge";
        badge.textContent      = count;
        badge.title            = `${count} unmatched file${count !== 1 ? "s" : ""} — click to review`;
        badge.dataset.seriesId = seriesId;
        badge.addEventListener("click", e => {
            e.preventDefault(); e.stopPropagation();
            showPanel();
            _openSeriesPanel(seriesId);
        });
        link.appendChild(badge);
    });
}

export function injectBadges() {
    for (const [seriesId, entry] of _cache) {
        injectBadgeForSlug(entry.titleSlug, entry.count, seriesId);
    }
}

function _startBadgeObserver() {
    if (_badgeObs) return;
    _badgeObs = new MutationObserver(() => {
        if (!isLibraryPage()) return;
        clearTimeout(_badgeDebounce);
        _badgeDebounce = setTimeout(injectBadges, 120);
    });
    _badgeObs.observe(document.body, { childList: true, subtree: true });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _esc(s) {
    return String(s ?? "")
        .replace(/&/g,"&amp;").replace(/</g,"&lt;")
        .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function _timeAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60)    return "just now";
    if (s < 3600)  return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
    return `${Math.floor(s / 86400)}d ago`;
}
