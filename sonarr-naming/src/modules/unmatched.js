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

/**
 * Call Sonarr's manual-import endpoint to find files that are in the
 * series folder but have NOT been imported as episode files yet.
 * Updates the 📁 button badge when unmatched files are found.
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

        if (btn) {
            if (items.length > 0) {
                btn.classList.add("has-unmatched");
                btn.dataset.count = items.length;
                btn.title = `${items.length} unmatched file${items.length > 1 ? "s" : ""} found in series folder`;
            } else {
                btn.classList.remove("has-unmatched");
                delete btn.dataset.count;
                btn.title = "No unmatched files";
            }
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

    const fileRows = items.length === 0
        ? `<p style="color:#567;font-size:12px;text-align:center;padding:12px 0">
               No unmatched files found in folder.
           </p>`
        : items.map(item => {
            const relPath   = item.relativePath ?? item.path ?? "(unknown path)";
            const size      = fmtSize(item.size);
            const quality   = item.quality?.quality?.name ?? "";
            const episodes  = item.episodes ?? [];
            const rejections = (item.rejections ?? []).filter(r =>
                r.reason !== "Already imported"); // filterExistingFiles should have handled this

            let epLine = "";
            if (episodes.length > 0) {
                const epLabels = episodes.map(e =>
                    `S${String(e.seasonNumber).padStart(2,"0")}E${String(e.episodeNumber).padStart(2,"0")}`
                ).join(", ");
                epLine = `<div class="unm-ep">→ ${epLabels}</div>`;
            } else {
                epLine = `<div class="unm-ep unm-ep-unknown">⚠ No episode match</div>`;
            }

            const rejLine = rejections.length
                ? rejections.map(r =>
                    `<div class="unm-rejection">⚠ ${r.reason}</div>`
                  ).join("")
                : "";

            return `<div class="unm-file${episodes.length === 0 ? " unm-unresolved" : ""}">
                <div class="unm-path">${relPath}</div>
                <div class="unm-meta">
                    ${size ? `<span class="unm-size">${size}</span>` : ""}
                    ${quality ? `<span class="unm-quality">${quality}</span>` : ""}
                </div>
                ${epLine}
                ${rejLine}
            </div>`;
        }).join("");

    panel.innerHTML = `
        <div class="rfp-head" style="color:#f80;border-bottom-color:#3a2a00">
            📁 ${items.length} unmatched file${items.length !== 1 ? "s" : ""} in folder
            <span class="rfp-head-close">✕</span>
        </div>
        <div class="rfp-body">
            <p class="rfp-desc">
                Files found in the series folder that Sonarr has not imported as episode files yet.
                They may need manual import or renaming so Sonarr can recognise them.
            </p>
            <div class="unm-file-list">${fileRows}</div>
        </div>
        <div style="padding:10px 13px 14px;flex-shrink:0;display:flex;gap:8px">
            <button class="rfp-btn rfp-cancel" id="unm-close">Close</button>
        </div>`;

    document.body.appendChild(panel);
    requestAnimationFrame(() => panel.classList.add("open"));

    panel.querySelector(".rfp-head-close").addEventListener("click", () => panel.classList.remove("open"));
    panel.querySelector("#unm-close").addEventListener("click",      () => panel.classList.remove("open"));
}
