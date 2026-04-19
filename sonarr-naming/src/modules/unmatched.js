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
 * Call Sonarr's manual-import endpoint to find files that are in the
 * series folder but have NOT been imported as episode files yet.
 * Shows the 📁 button (with badge) only when unmatched files are found.
 */
export async function checkUnmatchedFiles() {
    const _spData = getSpData();
    if (!_spData?.series) return;

    const { series } = _spData;
    const btn = document.getElementById("rg-unmatched-btn");

    try {
        // filterExistingFiles=true → exclude files already in Sonarr's database
        const items = await apiReq("GET",
            `/api/v3/manualimport?seriesId=${series.id}` +
            `&folder=${encodeURIComponent(series.path)}` +
            `&filterExistingFiles=true&sortKey=relativePath&sortDirection=ascending`
        );

        // Store for panel use
        _spData.unmatchedFiles = items;

        if (!btn) return;

        // Only alert when files have NO episode match — those need manual action.
        // Files that are matched-but-not-yet-imported are handled by Sonarr automatically.
        const noMatchCount = items.filter(i => !(i.episodes?.length > 0)).length;

        if (noMatchCount > 0) {
            btn.classList.add("visible", "has-unmatched");
            btn.dataset.count = noMatchCount;
            btn.title = `${noMatchCount} file${noMatchCount > 1 ? "s" : ""} in folder with no episode match`;
        } else {
            // All files matched (or none at all) → keep button hidden
            btn.classList.remove("visible", "has-unmatched");
            delete btn.dataset.count;
        }
    } catch (e) {
        console.warn("[RG Unmatched]", e.message);
    }
}

/** Build and show the unmatched files slide-in panel. */
export function showUnmatchedPanel() {
    document.getElementById("rg-unmatched-panel")?.remove();

    const _spData = getSpData();
    const items   = _spData?.unmatchedFiles ?? [];

    const panel = document.createElement("div");
    panel.id = "rg-unmatched-panel";

    // ── Sort: unresolved (no episode match) first ─────────────────────────────
    const sorted = [...items].sort((a, b) => {
        const aMatch = (a.episodes?.length ?? 0) > 0;
        const bMatch = (b.episodes?.length ?? 0) > 0;
        return aMatch - bMatch; // unresolved (0) before matched (1)
    });

    const noMatch  = sorted.filter(i => !(i.episodes?.length > 0));
    const hasMatch = sorted.filter(i =>  (i.episodes?.length > 0));

    function buildFileRow(item) {
        const { filename, folder } = splitPath(item.relativePath ?? item.path);
        const size      = fmtSize(item.size);
        const quality   = item.quality?.quality?.name ?? "";
        const episodes  = item.episodes ?? [];
        const rejections = (item.rejections ?? []).filter(r =>
            r.reason !== "Already imported");

        const matched = episodes.length > 0;

        const epBadges = matched
            ? episodes.map(e =>
                `<span class="unm-ep-badge">` +
                `S${String(e.seasonNumber).padStart(2,"0")}` +
                `E${String(e.episodeNumber).padStart(2,"0")}` +
                `</span>`
              ).join("")
            : `<span class="unm-ep-badge unm-ep-none">⚠ No episode match</span>`;

        const chips = [
            size    ? `<span class="unm-chip unm-chip-size">${size}</span>`       : "",
            quality ? `<span class="unm-chip unm-chip-quality">${quality}</span>` : "",
        ].filter(Boolean).join("");

        const rejLines = rejections.length
            ? rejections.map(r =>
                `<div class="unm-rejection">⚠ ${r.reason}</div>`
              ).join("")
            : "";

        return `
            <div class="unm-file${matched ? "" : " unm-unresolved"}">
                <div class="unm-filename">${filename}</div>
                ${folder ? `<div class="unm-folder">${folder}</div>` : ""}
                <div class="unm-row2">
                    <div class="unm-chips">${chips}</div>
                    <div class="unm-eps">${epBadges}</div>
                </div>
                ${rejLines}
            </div>`;
    }

    function buildSection(label, colour, fileItems) {
        if (!fileItems.length) return "";
        return `
            <div class="unm-section">
                <div class="unm-section-lbl" style="color:${colour}">${label}</div>
                ${fileItems.map(buildFileRow).join("")}
            </div>`;
    }

    const body = items.length === 0
        ? `<p class="unm-empty">No unmatched files found in series folder.</p>`
        : buildSection("⚠ No episode match", "#f80", noMatch) +
          buildSection("✓ Episode matched (not yet imported)", "#6a6", hasMatch);

    panel.innerHTML = `
        <div class="rfp-head" style="color:#f80;border-bottom-color:#3a2000">
            📁 ${items.length} unmatched file${items.length !== 1 ? "s" : ""} in folder
            <span class="rfp-head-close">✕</span>
        </div>
        <div class="rfp-body">
            <p class="rfp-desc">
                Files in the series folder that Sonarr hasn't imported yet.
                They may need manual import or renaming so Sonarr can recognise them.
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
