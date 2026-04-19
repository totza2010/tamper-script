"use strict";

import { getSpData } from "./state.js";
import { apiReq } from "./api.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtSize(bytes) {
    if (!bytes) return "";
    if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + " GB";
    if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + " MB";
    return Math.round(bytes / 1e3) + " KB";
}

/** Split a path into { filename, folder } */
function splitPath(p) {
    if (!p) return { filename: "(unknown)", folder: "" };
    const norm = p.replace(/\\/g, "/");
    const idx  = norm.lastIndexOf("/");
    if (idx < 0) return { filename: norm, folder: "" };
    return { filename: norm.slice(idx + 1), folder: norm.slice(0, idx) };
}

/** Detect Plex-style multi-part filenames: -part1, -part2, Part 3, pt2 … */
function isMultiPart(filename) {
    return /-part\d+/i.test(filename) || /\bpart\s*\d+\b/i.test(filename);
}

/** Extract part number from filename, e.g. "-part2" → 2 */
function extractPartNum(filename) {
    const m = filename.match(/-?part\s*(\d+)/i);
    return m ? parseInt(m[1]) : null;
}

/** Extract SxxExx from filename → { sn, ep } or null */
function parseSeasonEp(filename) {
    const m = filename.match(/S(\d+)E(\d+)/i);
    return m ? { sn: parseInt(m[1]), ep: parseInt(m[2]) } : null;
}

/**
 * Given a multi-part item, find the Sonarr-imported file for the same episode
 * and derive the suggested rename target: "[imported basename] - ptN.ext"
 *
 * Returns { current, suggested, importedPath } or null when not computable.
 */
function buildRenameSuggestion(item, files, epMap) {
    const { filename } = splitPath(item.relativePath ?? item.path ?? "");
    const parsed = parseSeasonEp(filename);
    const partN  = extractPartNum(filename);
    if (!parsed || !partN) return null;

    // Find the file Sonarr has imported for this season+episode
    let importedFile = null;
    for (const [fileId, episodes] of epMap) {
        if (episodes.some(e => e.seasonNumber === parsed.sn && e.episodeNumber === parsed.ep)) {
            importedFile = files.find(f => f.id === fileId) ?? null;
            break;
        }
    }
    if (!importedFile) return null;

    const { filename: importedName } = splitPath(importedFile.relativePath ?? "");
    if (!importedName) return null;

    const dot  = importedName.lastIndexOf(".");
    const base = dot >= 0 ? importedName.slice(0, dot) : importedName;
    const ext  = dot >= 0 ? importedName.slice(dot)    : ".mkv";

    return {
        current:      filename,
        suggested:    `${base} - pt${partN}${ext}`,
        importedPath: importedFile.relativePath ?? "",
    };
}

// ── API ───────────────────────────────────────────────────────────────────────

/**
 * Call Sonarr's manual-import endpoint to find files not yet imported.
 * Button appears only for genuinely unrecognised files (no episode match, not multi-part).
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

        const problemCount = items.filter(i => {
            if (i.episodes?.length > 0) return false;
            const { filename } = splitPath(i.relativePath ?? i.path);
            return !isMultiPart(filename);
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

function buildFileRow(item, badgeHtml, renameSugg) {
    const { filename, folder } = splitPath(item.relativePath ?? item.path);
    const size       = fmtSize(item.size);
    const quality    = item.quality?.quality?.name ?? "";
    const rejections = (item.rejections ?? []).filter(r => r.reason !== "Already imported");

    const chips = [
        size    ? `<span class="unm-chip unm-chip-size">${size}</span>`       : "",
        quality ? `<span class="unm-chip unm-chip-quality">${quality}</span>` : "",
    ].filter(Boolean).join("");

    const rejLines = rejections.length
        ? rejections.map(r => `<div class="unm-rejection">⚠ ${r.reason}</div>`).join("")
        : "";

    // Rename suggestion block (multi-part only)
    let renameBlock = "";
    if (renameSugg) {
        renameBlock = `
            <div class="unm-rename">
                <div class="unm-rename-lbl">Rename to:</div>
                <div class="unm-rename-row">
                    <span class="unm-rename-target" title="${renameSugg.suggested}">${renameSugg.suggested}</span>
                    <button class="unm-copy-btn" data-copy="${renameSugg.suggested}" title="Copy filename">📋</button>
                </div>
            </div>`;
    } else if (item._isMultiPart) {
        // multi-part but episode not imported yet
        renameBlock = `
            <div class="unm-rename unm-rename--unknown">
                Episode not yet imported by Sonarr — rename suggestion unavailable
            </div>`;
    }

    return `
        <div class="unm-file">
            <div class="unm-filename">${filename}</div>
            ${folder ? `<div class="unm-folder">${folder}</div>` : ""}
            <div class="unm-row2">
                <div class="unm-chips">${chips}</div>
                <div class="unm-eps">${badgeHtml}</div>
            </div>
            ${renameBlock}
            ${rejLines}
        </div>`;
}

function buildSection(cls, label, fileItems, getBadge, getRenameSugg) {
    if (!fileItems.length) return "";
    return `
        <div class="unm-section unm-section--${cls}">
            <div class="unm-section-lbl">${label}</div>
            <div class="unm-card-list">
                ${fileItems.map(i => buildFileRow(i, getBadge(i), getRenameSugg?.(i) ?? null)).join("")}
            </div>
        </div>`;
}

/** Build and show the unmatched files slide-in panel. */
export function showUnmatchedPanel() {
    document.getElementById("rg-unmatched-panel")?.remove();

    const _spData = getSpData();
    const items   = _spData?.unmatchedFiles ?? [];
    const files   = _spData?.files   ?? [];
    const epMap   = _spData?.epMap   ?? new Map();

    const panel = document.createElement("div");
    panel.id = "rg-unmatched-panel";

    // Classify into 3 groups
    const problem   = [];
    const multiPart = [];
    const pending   = [];

    for (const item of items) {
        const { filename } = splitPath(item.relativePath ?? item.path);
        if (item.episodes?.length > 0) {
            pending.push(item);
        } else if (isMultiPart(filename)) {
            item._isMultiPart = true;
            multiPart.push(item);
        } else {
            problem.push(item);
        }
    }

    const epBadge = item => item.episodes.map(e =>
        `<span class="unm-ep-badge unm-ep-match">` +
        `S${String(e.seasonNumber).padStart(2,"0")}` +
        `E${String(e.episodeNumber).padStart(2,"0")}` +
        `</span>`
    ).join("");

    const partBadge = item => {
        const { filename } = splitPath(item.relativePath ?? item.path);
        const m = filename.match(/-?(part\s*\d+)/i);
        const label = m ? m[1].replace(/\s+/, "") : "multi-part";
        return `<span class="unm-ep-badge unm-ep-part">${label}</span>`;
    };

    const body = items.length === 0
        ? `<p class="unm-empty">No unmatched files found in series folder.</p>`
        : buildSection("problem", "⚠ Unrecognised — needs attention", problem,
                () => `<span class="unm-ep-badge unm-ep-none">No episode match</span>`) +
          buildSection("multipart", "📼 Multi-part — Plex sequential play", multiPart, partBadge,
                item => buildRenameSuggestion(item, files, epMap)) +
          buildSection("pending", "✓ Episode matched — pending Sonarr import", pending, epBadge);

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
                Multi-part files are normal for Plex sequential-play.
                Use the 📋 copy button to get the correct target filename for renaming in your file manager.
            </p>
            <div class="unm-file-list">${body}</div>
        </div>
        <div style="padding:10px 13px 14px;flex-shrink:0;display:flex;gap:8px">
            <button class="rfp-btn rfp-cancel" id="unm-close">Close</button>
        </div>`;

    document.body.appendChild(panel);
    requestAnimationFrame(() => panel.classList.add("open"));

    // Close buttons
    panel.querySelector(".rfp-head-close").addEventListener("click", () => panel.classList.remove("open"));
    panel.querySelector("#unm-close").addEventListener("click",      () => panel.classList.remove("open"));

    // Copy-to-clipboard buttons
    panel.addEventListener("click", e => {
        const btn = e.target.closest(".unm-copy-btn");
        if (!btn) return;
        const text = btn.dataset.copy;
        navigator.clipboard.writeText(text).then(() => {
            const orig = btn.textContent;
            btn.textContent = "✓";
            btn.classList.add("copied");
            setTimeout(() => { btn.textContent = orig; btn.classList.remove("copied"); }, 1500);
        }).catch(() => {
            // Fallback: select the text node next to button
            const range = document.createRange();
            range.selectNode(btn.previousElementSibling);
            window.getSelection()?.removeAllRanges();
            window.getSelection()?.addRange(range);
        });
    });
}
