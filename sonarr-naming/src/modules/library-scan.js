"use strict";

import { apiReq } from "./api.js";
import { setSpData } from "./state.js";
import { showToast } from "./utils.js";
import { showUnmatchedPanel } from "./unmatched.js";

// ── Cache: seriesId → { count, items, series } ────────────────────────────────
const _cache  = new Map();
let _scanDone = false;
let _scanning = false;

// ── MutationObserver for badge re-injection (React re-renders) ────────────────
let _badgeObs     = null;
let _badgeDebounce = null;

// ── Library page check ────────────────────────────────────────────────────────
export function isLibraryPage() {
    return /^\/(series)?\/?$/.test(location.pathname);
}

// ── Entry point — call when library page is detected ─────────────────────────
export async function initLibraryScan() {
    if (_scanning) return;

    if (_scanDone) {
        // Already have results — just show chip summary and re-inject badges
        showDoneChip();
        injectBadges();
        startBadgeObserver();
        return;
    }

    _scanning = true;
    showChip("scanning", 0, 0);

    try {
        const allSeries = await apiReq("GET", "/api/v3/series");
        const active    = allSeries.filter(s => s.path);
        const total     = active.length;
        let   done      = 0;

        showChip("scanning", done, total);

        // ── Scan all series concurrently ──────────────────────────────────────
        await Promise.all(active.map(async series => {
            try {
                const items = await apiReq("GET",
                    `/api/v3/manualimport?seriesId=${series.id}` +
                    `&folder=${encodeURIComponent(series.path)}` +
                    `&filterExistingFiles=true&sortKey=relativePath&sortDirection=ascending`
                );
                const count = items.filter(it => !(it.episodes?.length > 0)).length;
                _cache.set(series.id, { count, items, series });
                if (count > 0) injectBadgeForSlug(series.titleSlug, count, series.id);
            } catch { /* skip failed series silently */ }

            done++;
            showChip("scanning", done, total);
        }));

        _scanDone = true;
        _scanning = false;
        showDoneChip();
        startBadgeObserver();

    } catch (e) {
        _scanning = false;
        console.warn("[RG Library Scan]", e.message);
        removeChip();
    }
}

// ── Cleanup — call when navigating away from library page ─────────────────────
export function cleanupLibraryScan() {
    _badgeObs?.disconnect();
    _badgeObs = null;
    clearTimeout(_badgeDebounce);
    removeChip();
}

// ── Badge injection ───────────────────────────────────────────────────────────

function injectBadgeForSlug(slug, count, seriesId) {
    document.querySelectorAll(`a[href='/series/${slug}']`).forEach(link => {
        if (link.querySelector(".lib-unm-badge")) return;
        const badge = document.createElement("div");
        badge.className       = "lib-unm-badge";
        badge.textContent     = count;
        badge.title           = `${count} unmatched file${count !== 1 ? "s" : ""} — click to review`;
        badge.dataset.seriesId = seriesId;
        badge.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();
            openLibraryPanel(seriesId);
        });
        link.appendChild(badge);
    });
}

function injectBadges() {
    if (!isLibraryPage()) return;
    for (const [seriesId, { count, series }] of _cache) {
        if (count > 0) injectBadgeForSlug(series.titleSlug, count, seriesId);
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

// ── Status chip (floating bottom-centre) ─────────────────────────────────────

function getOrCreateChip() {
    let chip = document.getElementById("lib-scan-chip");
    if (!chip) {
        chip = document.createElement("div");
        chip.id = "lib-scan-chip";
        document.body.appendChild(chip);
    }
    return chip;
}

function showChip(state, done, total) {
    const chip = getOrCreateChip();
    chip.className = "lib-scan-chip--scanning";
    chip.textContent = total > 0 ? `📁 Scanning ${done} / ${total}…` : "📁 Scanning…";
    chip.onclick = null;
}

function showDoneChip() {
    const withUnmatched = [..._cache.values()].filter(v => v.count > 0).length;
    const chip = getOrCreateChip();

    if (withUnmatched > 0) {
        chip.className   = "lib-scan-chip--warn";
        chip.textContent = `📁 ${withUnmatched} series with unmatched files`;
        chip.title       = "Click to re-scan";
        chip.onclick     = () => rescan();
    } else {
        chip.className   = "lib-scan-chip--ok";
        chip.textContent = "📁 All files matched ✓";
        chip.title       = "Click to re-scan";
        chip.onclick     = () => rescan();
        setTimeout(() => {
            if (chip.isConnected) chip.remove();
        }, 4000);
    }
}

function removeChip() {
    document.getElementById("lib-scan-chip")?.remove();
}

async function rescan() {
    _cache.clear();
    _scanDone = false;
    removeChip();
    await initLibraryScan();
}

// ── Open the unmatched panel for a specific series ────────────────────────────

async function openLibraryPanel(seriesId) {
    const cached = _cache.get(seriesId);
    if (!cached) return;

    // Close any existing panel first
    document.getElementById("rg-unmatched-panel")?.remove();

    // Show a brief loading toast
    showToast(`Loading ${cached.series.title}…`);

    try {
        const [files, episodes] = await Promise.all([
            apiReq("GET", `/api/v3/episodefile?seriesId=${seriesId}`),
            apiReq("GET", `/api/v3/episode?seriesId=${seriesId}`),
        ]);

        // Build epMap: fileId → episode[]
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

        // Populate shared state and open panel
        setSpData({
            series:         cached.series,
            files,
            epMap,
            unmatchedFiles: cached.items,
        });

        showUnmatchedPanel();

    } catch (e) {
        console.warn("[RG Library Scan] Failed to open panel:", e.message);
        showToast(`Failed to load data: ${e.message}`);
    }
}
