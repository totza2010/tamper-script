"use strict";

import { apiReq } from "./api.js";
import { setSpData } from "./state.js";
import { showToast } from "./utils.js";
import { showUnmatchedPanel } from "./unmatched.js";

// ── Persistence ───────────────────────────────────────────────────────────────
// Slim entries only; full data fetched on-demand when opening a series panel.

const CACHE_KEY   = `lib_unm_${location.hostname}`;
const CONCURRENCY = 5;   // max simultaneous manualimport requests during scan

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
// entry: { seriesId, count, title, titleSlug, path }
const _cache  = new Map();
let _scanTime = null;
let _scanning = false;
let _done     = 0;
let _total    = 0;

let _badgeObs      = null;
let _badgeDebounce = null;

// ── Library page detection ─────────────────────────────────────────────────────
export function isLibraryPage() {
    return /^\/(series)?\/?$/.test(location.pathname);
}

// ── Called from series page after checkUnmatchedFiles() ──────────────────────
// Updates the per-series entry in the library cache silently.
export function updateCacheEntry(series, count) {
    if (count > 0) {
        _cache.set(series.id, {
            seriesId:  series.id,
            count,
            title:     series.title,
            titleSlug: series.titleSlug,
            path:      series.path,
        });
    } else {
        _cache.delete(series.id);   // series now clean — remove from list
    }
    saveCache();
    _refreshFabBadge();
    _refreshPanelRow(series.id, count, series.title, series.titleSlug);
}

// ── Init / cleanup ────────────────────────────────────────────────────────────

export function initLibraryScan() {
    loadCache();

    const fab = _getOrCreateFab();
    fab.classList.add("visible");
    _refreshFabBadge();

    // Restore badges on cards from cache (no network call)
    injectBadges();
    _startBadgeObserver();

    // Auto-open panel if there are cached results
    if (_cache.size > 0) showPanel();
}

export function cleanupLibraryScan() {
    document.getElementById("lib-scan-fab")?.classList.remove("visible");
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
    fab.id        = "lib-scan-fab";
    fab.className = "rg-fab-side";
    fab.title     = "Unmatched files in library";
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
    panel.querySelector(".lsp-list").addEventListener("click", e => {
        const btn = e.target.closest(".lsp-series-btn");
        if (btn) _openSeriesPanel(parseInt(btn.dataset.id));
    });

    // Populate from current cache
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

    if (scanBtn) { scanBtn.disabled = false; scanBtn.textContent = "↺ Re-scan"; }

    const count = _cache.size;
    const stamp = _scanTime ? ` · ${_timeAgo(_scanTime)}` : "";

    if (count > 0) {
        el.className   = "lsp-subhead lsp-subhead--warn";
        el.textContent = `${count} series with unmatched files${stamp}`;
    } else if (_scanTime) {
        el.className   = "lsp-subhead lsp-subhead--ok";
        el.textContent = `All files matched ✓${stamp}`;
    } else {
        el.className   = "lsp-subhead";
        el.textContent = "Press ▶ Scan all to check all series.";
    }

    const empty = document.getElementById("lib-scan-empty");
    if (empty) empty.textContent = count === 0 && _scanTime
        ? "No unmatched files found in any series folder."
        : "";
}

function _appendRow(entry) {
    const list = document.getElementById("lib-scan-list");
    if (!list) return;
    if (list.querySelector(`[data-id="${entry.seriesId}"]`)) return;

    const btn = document.createElement("button");
    btn.className  = "lsp-series-btn";
    btn.dataset.id = entry.seriesId;
    btn.innerHTML  = `
        <span class="lsp-series-title">${_esc(entry.title)}</span>
        <span class="lsp-series-count">${entry.count} file${entry.count !== 1 ? "s" : ""}</span>`;
    list.appendChild(btn);
}

function _refreshPanelRow(seriesId, count, title, titleSlug) {
    const list = document.getElementById("lib-scan-list");
    if (!list) return;

    const existing = list.querySelector(`[data-id="${seriesId}"]`);
    if (count > 0) {
        if (existing) {
            existing.querySelector(".lsp-series-count").textContent =
                `${count} file${count !== 1 ? "s" : ""}`;
        } else {
            _appendRow({ seriesId, count, title, titleSlug });
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
        _total = active.length;
        _updateSubhead();

        // ── Semaphore: max CONCURRENCY requests in-flight at once ──────────────
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
                    const count = items.filter(it => !(it.episodes?.length > 0)).length;
                    if (count > 0) {
                        const entry = {
                            seriesId:  series.id,
                            count,
                            title:     series.title,
                            titleSlug: series.titleSlug,
                            path:      series.path,
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

        // Launch CONCURRENCY workers — they pull from the shared idx counter
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

// ── Open series unmatched panel ────────────────────────────────────────────────

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
