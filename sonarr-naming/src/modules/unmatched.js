"use strict";

import { getSpData } from "./state.js";
import { apiReq } from "./api.js";

// ── Unmatched files in series folder ─────────────────────────────────────────

function fmtSize(bytes) {
    if (!bytes) return "";
    if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + " GB";
    if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + " MB";
    return Math.round(bytes / 1e3) + " KB";
}

/** Split a relative/full path into { filename, folder } */
function splitPath(p) {
    if (!p) return { filename: "(unknown)", folder: "" };
    const norm = p.replace(/\\/g, "/");
    const idx  = norm.lastIndexOf("/");
    if (idx < 0) return { filename: norm, folder: "" };
    return { filename: norm.slice(idx + 1), folder: norm.slice(0, idx) };
}

/**
 * Detect Plex-style multi-part files: anything with -part1 / -part2 / Part 3 etc.
 * These are intentional — Sonarr can't import them but Plex plays them sequentially.
 */
function isMultiPart(filename) {
    return /-part\d+/i.test(filename) || /\bpart\s*\d+\b/i.test(filename);
}

/**
 * Call Sonarr's manual-import endpoint to find files that are in the
 * series folder but have NOT been imported as episode files yet.
 *
 * Button visibility rules:
 *   - Hidden  when 0 results, or all results are multi-part / already-matched
 *   - Visible when there are genuinely unrecognised files (no episode match, not multi-part)
 */
export async function checkUnmatchedFiles() {
    const _spData = getSpData();
    if (!_spData?.series) return;

    const { series } = _spData;
    const btn = document.getElementById("rg-unmatched-btn");

    try {
        const items = await apiReq("GET",
            `/api/v3/manualimport?seriesId=${series.id}` +
            `&folder=${encodeURIComponent(series.path)}` +
            `&filterExistingFiles=true&sortKey=relativePath&sortDirection=ascending`
        );

        _spData.unmatchedFiles = items;

        if (!btn) return;

        // Truly problematic = no episode match AND not a known multi-part file
        const problemCount = items.filter(i => {
            if (i.episodes?.length > 0) return false;          // matched → Sonarr handles it
            const { filename } = splitPath(i.relativePath ?? i.path);
            return !isMultiPart(filename);                     // multi-part → intentional
        }).length;

        if (problemCount > 0) {
            btn.classList.add("visible", "has-unmatched");
            btn.dataset.count = problemCount;
            btn.title = `${problemCount} unrecognised file${problemCount > 1 ? "s" : ""} in series folder`;
        } else {
            btn.classList.remove("visible", "has-unmatched");
            delete btn.dataset.count;
        }
    } catch (e) {
        console.warn("[RG Unmatched]", e.message);
    }
}

// ── Panel ─────────────────────────────────────────────────────────────────────

function buildFileRow(item, badgeHtml) {
    const { filename, folder } = splitPath(item.relativePath ?? item.path);
    const size      = fmtSize(item.size);
    const quality   = item.quality?.quality?.name ?? "";
    const rejections = (item.rejections ?? []).filter(r => r.reason !== "Already imported");

    const chips = [
        size    ? `<span class="unm-chip unm-chip-size">${size}</span>`       : "",
        quality ? `<span class="unm-chip unm-chip-quality">${quality}</span>` : "",
    ].filter(Boolean).join("");

    const rejLines = rejections.length
        ? rejections.map(r => `<div class="unm-rejection">⚠ ${r.reason}</div>`).join("")
        : "";

    return `
        <div class="unm-file">
            <div class="unm-filename">${filename}</div>
            ${folder ? `<div class="unm-folder">${folder}</div>` : ""}
            <div class="unm-row2">
                <div class="unm-chips">${chips}</div>
                <div class="unm-eps">${badgeHtml}</div>
            </div>
            ${rejLines}
        </div>`;
}

function buildSection(cls, label, fileItems, getBadge) {
    if (!fileItems.length) return "";
    return `
        <div class="unm-section unm-section--${cls}">
            <div class="unm-section-lbl">${label}</div>
            <div class="unm-card-list">
                ${fileItems.map(i => buildFileRow(i, getBadge(i))).join("")}
            </div>
        </div>`;
}

/** Build and show the unmatched files slide-in panel. */
export function showUnmatchedPanel() {
    document.getElementById("rg-unmatched-panel")?.remove();

    const _spData = getSpData();
    const items   = _spData?.unmatchedFiles ?? [];

    const panel = document.createElement("div");
    panel.id = "rg-unmatched-panel";

    // Classify
    const problem   = [];   // no episode match, not multi-part → needs attention
    const multiPart = [];   // no episode match but -part\d+ filename → intentional
    const pending   = [];   // has episode match but not yet imported → Sonarr will handle

    for (const item of items) {
        const { filename } = splitPath(item.relativePath ?? item.path);
        if (item.episodes?.length > 0) {
            pending.push(item);
        } else if (isMultiPart(filename)) {
            multiPart.push(item);
        } else {
            problem.push(item);
        }
    }

    const epBadges = item => item.episodes.map(e =>
        `<span class="unm-ep-badge unm-ep-match">` +
        `S${String(e.seasonNumber).padStart(2,"0")}` +
        `E${String(e.episodeNumber).padStart(2,"0")}` +
        `</span>`
    ).join("");

    const body = items.length === 0
        ? `<p class="unm-empty">No unmatched files found in series folder.</p>`
        : buildSection("problem", "⚠ Unrecognised — needs attention", problem,
                () => `<span class="unm-ep-badge unm-ep-none">No episode match</span>`) +
          buildSection("multipart", "📼 Multi-part files — Plex sequential play (normal)", multiPart,
                i => {
                    // Try to show which part number from filename
                    const { filename } = splitPath(i.relativePath ?? i.path);
                    const m = filename.match(/-?(part\s*\d+)/i);
                    return m
                        ? `<span class="unm-ep-badge unm-ep-part">${m[1].replace(/\s+/,"")}</span>`
                        : `<span class="unm-ep-badge unm-ep-part">multi-part</span>`;
                }) +
          buildSection("pending", "✓ Episode matched — pending Sonarr import", pending, epBadges);

    // Summary counts in header
    const headerDetail = [
        problem.length   ? `<span class="unm-hcount unm-hcount--warn">${problem.length} unrecognised</span>`   : "",
        multiPart.length ? `<span class="unm-hcount unm-hcount--part">${multiPart.length} multi-part</span>`   : "",
        pending.length   ? `<span class="unm-hcount unm-hcount--ok">${pending.length} pending import</span>`   : "",
    ].filter(Boolean).join("");

    panel.innerHTML = `
        <div class="rfp-head" style="color:#f80;border-bottom-color:#3a2000">
            <span>📁 ${items.length} file${items.length !== 1 ? "s" : ""} not yet imported</span>
            <span class="rfp-head-close">✕</span>
        </div>
        <div class="rfp-body">
            ${headerDetail ? `<div class="unm-summary">${headerDetail}</div>` : ""}
            <p class="rfp-desc">
                Files in the series folder that Sonarr hasn't imported yet.
                Multi-part files are normal for Plex sequential-play — Sonarr
                doesn't import them, but they don't need to be removed.
            </p>
            <div class="unm-file-list">${body}</div>
        </div>
        <div style="padding:10px 13px 14px;flex-shrink:0;display:flex;gap:8px">
            <button class="rfp-btn rfp-cancel" id="unm-close">Close</button>
        </div>`;

    document.body.appendChild(panel);
    requestAnimationFrame(() => panel.classList.add("open"));

    panel.querySelector(".rfp-head-close").addEventListener("click", () => panel.classList.remove("open"));
    panel.querySelector("#unm-close").addEventListener("click",      () => panel.classList.remove("open"));
}
