"use strict";

import { apiReq } from "./api.js";
import { setSpData } from "./state.js";
import { showToast } from "./utils.js";
import { showUnmatchedPanel } from "./unmatched.js";

// ── Persistence (GM storage) ───────────────────────────────────────────────────
// Stores slim entries only; full series object fetched on-demand when opening panel.
// No TTL — user controls freshness via ↺ Re-scan.

const CACHE_KEY = `lib_unm_${location.hostname}`;

function saveCache() {
    const entries = [..._cache.values()];
    GM_setValue(CACHE_KEY, JSON.stringify({ ts: Date.now(), entries }));
}

function loadPersistedCache() {
    try {
        const raw = GM_getValue(CACHE_KEY, null);
        if (!raw) return false;
        const { ts, entries } = JSON.parse(raw);
        _cache.clear();
        (entries ?? []).forEach(e => _cache.set(e.seriesId, e));
        _scanTime = ts;
        return true;
    } catch { return false; }
}

// ── Runtime state ──────────────────────────────────────────────────────────────
// entry shape: { seriesId, count, title, titleSlug, path }
const _cache  = new Map();
let _scanTime = null;
let _scanning = false;
let _done     = 0;
let _total    = 0;

// Badge MutationObserver
let _badgeObs      = null;
let _badgeDebounce = null;

// ── Library page detection ─────────────────────────────────────────────────────
export function isLibraryPage() {
    return /^\/(series)?\/?$/.test(location.pathname);
}

// ── Entry point ────────────────────────────────────────────────────────────────
export function initLibraryScan() {
    if (_scanning) { showPanel(); return; }

    if (loadPersistedCache()) {
        // Use cached results — show immediately, no network needed
        showPanel();
        injectBadges();
        startBadgeObserver();
    } else {
        // First run — open panel in scanning state then fetch
        showPanel();
        startScan();
    }
}

// ── Cleanup ────────────────────────────────────────────────────────────────────
export function cleanupLibraryScan() {
    _badgeObs?.disconnect();
    _badgeObs = null;
    clearTimeout(_badgeDebounce);
    document.getElementById("lib-scan-panel")?.classList.remove("open");
}

// ── Scan ───────────────────────────────────────────────────────────────────────
async function startScan() {
    if (_scanning) return;
    _scanning = true;
    _cache.clear();
    _done = _total = 0;

    clearPanelList();
    updateSubhead();     // show "Scanning…"

    try {
        const allSeries = await apiReq("GET", "/api/v3/series");
        const active = allSeries.filter(s => s.path);
        _total = active.length;
        updateSubhead();

        await Promise.all(active.map(async series => {
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
                    appendPanelRow(entry);                  // live-append while scanning
                    injectBadgeForSlug(series.titleSlug, count, series.id);
                }
            } catch { /* skip silently */ }

            _done++;
            updateSubhead();
        }));

        _scanTime = Date.now();
        _scanning = false;
        saveCache();
        updateSubhead();        // show final summary
        startBadgeObserver();

    } catch (e) {
        _scanning = false;
        console.warn("[RG Library Scan]", e.message);
        updateSubhead();
    }
}

async function rescan() {
    _cache.clear();
    _scanTime = null;
    GM_setValue(CACHE_KEY, "null");
    clearPanelList();
    await startScan();
}

// ── Panel ──────────────────────────────────────────────────────────────────────

function showPanel() {
    let panel = document.getElementById("lib-scan-panel");
    if (panel) { panel.classList.add("open"); return; }

    panel = document.createElement("div");
    panel.id = "lib-scan-panel";
    panel.innerHTML = `
        <div class="lsp-head">
            <span class="lsp-title">📁 Unmatched Files</span>
            <div class="lsp-head-right">
                <button class="lsp-rescan-btn" title="Re-scan all series">↺ Re-scan</button>
                <button class="lsp-close"      title="Close">✕</button>
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
    panel.querySelector(".lsp-rescan-btn").addEventListener("click",
        () => rescan());
    panel.querySelector(".lsp-list").addEventListener("click", e => {
        const btn = e.target.closest(".lsp-series-btn");
        if (btn) openSeriesPanel(parseInt(btn.dataset.id));
    });

    // Populate from current in-memory cache (may be empty if scan just started)
    [..._cache.values()].forEach(appendPanelRow);
    updateSubhead();
}

function updateSubhead() {
    const el = document.getElementById("lib-scan-subhead");
    if (!el) return;

    if (_scanning) {
        el.className   = "lsp-subhead lsp-subhead--scanning";
        el.textContent = _total > 0
            ? `Scanning ${_done} / ${_total}…`
            : "Connecting…";
        return;
    }

    const count = _cache.size;
    const ago   = _scanTime ? timeAgo(_scanTime) : "";
    const stamp = ago ? ` · ${ago}` : "";

    if (count > 0) {
        el.className   = "lsp-subhead lsp-subhead--warn";
        el.textContent = `${count} series with unmatched files${stamp}`;
    } else if (_scanTime) {
        el.className   = "lsp-subhead lsp-subhead--ok";
        el.textContent = `All files matched ✓${stamp}`;
    } else {
        el.className   = "lsp-subhead";
        el.textContent = "";
    }

    const empty = document.getElementById("lib-scan-empty");
    if (empty) empty.textContent = count === 0 && _scanTime
        ? "No unmatched files found in any series folder."
        : "";
}

function appendPanelRow(entry) {
    const list = document.getElementById("lib-scan-list");
    if (!list) return;
    if (list.querySelector(`[data-id="${entry.seriesId}"]`)) return;

    const btn = document.createElement("button");
    btn.className    = "lsp-series-btn";
    btn.dataset.id   = entry.seriesId;
    btn.innerHTML    = `
        <span class="lsp-series-title">${esc(entry.title)}</span>
        <span class="lsp-series-count">${entry.count} file${entry.count !== 1 ? "s" : ""}</span>`;
    list.appendChild(btn);
}

function clearPanelList() {
    const list  = document.getElementById("lib-scan-list");
    const empty = document.getElementById("lib-scan-empty");
    if (list)  list.innerHTML    = "";
    if (empty) empty.textContent = "";
}

// ── Open unmatched panel for a specific series ────────────────────────────────

async function openSeriesPanel(seriesId) {
    const entry = _cache.get(seriesId);
    if (!entry) return;

    showToast(`Loading ${entry.title}…`);

    try {
        // Fetch full series object + manualimport items + files + episodes in parallel
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
        showUnmatchedPanel();   // opens on top of lib-scan-panel

    } catch (e) {
        console.warn("[RG Library Scan] openSeriesPanel:", e.message);
        showToast(`Error: ${e.message}`);
    }
}

// ── Badge injection on series cards ──────────────────────────────────────────

function injectBadgeForSlug(slug, count, seriesId) {
    document.querySelectorAll(`a[href='/series/${slug}']`).forEach(link => {
        if (link.querySelector(".lib-unm-badge")) return;
        const badge = document.createElement("div");
        badge.className      = "lib-unm-badge";
        badge.textContent    = count;
        badge.title          = `${count} unmatched file${count !== 1 ? "s" : ""} — click to review`;
        badge.dataset.seriesId = seriesId;
        badge.addEventListener("click", e => {
            e.preventDefault(); e.stopPropagation();
            showPanel();
            openSeriesPanel(seriesId);
        });
        link.appendChild(badge);
    });
}

export function injectBadges() {
    for (const [seriesId, entry] of _cache) {
        injectBadgeForSlug(entry.titleSlug, entry.count, seriesId);
    }
}

function startBadgeObserver() {
    if (_badgeObs) return;
    _badgeObs = new MutationObserver(() => {
        if (!isLibraryPage()) return;
        clearTimeout(_badgeDebounce);
        _badgeDebounce = setTimeout(injectBadges, 120);
    });
    _badgeObs.observe(document.body, { childList: true, subtree: true });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s) {
    return String(s ?? "")
        .replace(/&/g,"&amp;").replace(/</g,"&lt;")
        .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function timeAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60)    return "just now";
    if (s < 3600)  return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
    return `${Math.floor(s / 86400)} day${Math.floor(s / 86400) !== 1 ? "s" : ""} ago`;
}
