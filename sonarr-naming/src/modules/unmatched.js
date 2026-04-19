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

function splitPath(p) {
    if (!p) return { filename: "(unknown)", folder: "" };
    const norm = p.replace(/\\/g, "/");
    const idx  = norm.lastIndexOf("/");
    if (idx < 0) return { filename: norm, folder: "" };
    return { filename: norm.slice(idx + 1), folder: norm.slice(0, idx) };
}

/** Detect files that already have -part\d+ / part N in their name */
function isMultiPart(filename) {
    return /-part\d+/i.test(filename) || /\bpart\s*\d+\b/i.test(filename);
}

function extractPartNum(filename) {
    const m = filename.match(/-?part\s*(\d+)/i);
    return m ? parseInt(m[1]) : null;
}

function parseSeasonEp(filename) {
    const m = filename.match(/S(\d+)E(\d+)/i);
    return m ? { sn: parseInt(m[1]), ep: parseInt(m[2]) } : null;
}

/**
 * Given an imported Sonarr file + part number → target filename.
 * e.g.  "Series - S01E04 - Title [HDTV] {RG}.mkv" + 2  →
 *        "Series - S01E04 - Title [HDTV] {RG} - pt2.mkv"
 */
function computeTargetName(importedFile, partNum) {
    const { filename } = splitPath(importedFile.relativePath ?? "");
    if (!filename) return null;
    const dot  = filename.lastIndexOf(".");
    const base = dot >= 0 ? filename.slice(0, dot) : filename;
    const ext  = dot >= 0 ? filename.slice(dot)    : ".mkv";
    return `${base} - pt${partNum}${ext}`;
}

/**
 * For a detected multi-part file (already has -partN):
 * look up the Sonarr-imported file for the same SxxExx and build rename target.
 */
function buildDetectedRename(item, files, epMap) {
    const { filename } = splitPath(item.relativePath ?? item.path ?? "");
    const parsed = parseSeasonEp(filename);
    const partN  = extractPartNum(filename);
    if (!parsed || !partN) return null;

    let importedFile = null;
    for (const [fileId, episodes] of epMap) {
        if (episodes.some(e => e.seasonNumber === parsed.sn && e.episodeNumber === parsed.ep)) {
            importedFile = files.find(f => f.id === fileId) ?? null;
            break;
        }
    }
    if (!importedFile) return null;

    const target = computeTargetName(importedFile, partN);
    return target ? { suggested: target } : null;
}

/**
 * Build sorted episode options for the pairing dropdown.
 * Source: epMap (fileId → episode[]) + files array.
 */
function buildEpisodeOptions(files, epMap) {
    const opts = [];
    for (const [fileId, episodes] of epMap) {
        const file = files.find(f => f.id === fileId);
        if (!file) continue;
        const ep = episodes[0];
        opts.push({
            fileId,
            sn: ep.seasonNumber,
            ep: ep.episodeNumber,
            label: `S${String(ep.seasonNumber).padStart(2,"0")}` +
                   `E${String(ep.episodeNumber).padStart(2,"0")}` +
                   (ep.title ? ` — ${ep.title}` : ""),
            file,
        });
    }
    opts.sort((a, b) => a.sn !== b.sn ? a.sn - b.sn : a.ep - b.ep);
    return opts;
}

// ── API ───────────────────────────────────────────────────────────────────────

/**
 * Check the series folder for files not yet imported.
 * Button shows when ANY file has no episode match (detected multi-part counts too).
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

        // Count ALL files with no episode match — includes detected multi-part
        const noEpMatchCount = items.filter(i => !(i.episodes?.length > 0)).length;

        if (noEpMatchCount > 0) {
            btn.classList.add("visible", "has-unmatched");
            btn.dataset.count = noEpMatchCount;
            btn.title = `${noEpMatchCount} file${noEpMatchCount > 1 ? "s" : ""} with no episode match`;
        } else {
            btn.classList.remove("visible", "has-unmatched");
            delete btn.dataset.count;
        }
    } catch (e) {
        console.warn("[RG Unmatched]", e.message);
    }
}

// ── Card builders ─────────────────────────────────────────────────────────────

function chipRow(item) {
    const size    = fmtSize(item.size);
    const quality = item.quality?.quality?.name ?? "";
    return [
        size    ? `<span class="unm-chip unm-chip-size">${size}</span>`       : "",
        quality ? `<span class="unm-chip unm-chip-quality">${quality}</span>` : "",
    ].filter(Boolean).join("");
}

function copyBtn(text, title = "Copy filename") {
    return `<button class="unm-copy-btn" data-copy="${text.replace(/"/g, "&quot;")}" title="${title}">📋</button>`;
}

/** Card: unmatched file with pairing UI (user assigns episode + part number) */
function buildUnmatchedCard(item, episodeOptions) {
    const { filename, folder } = splitPath(item.relativePath ?? item.path);
    const chips = chipRow(item);

    const epOpts = episodeOptions.map(o =>
        `<option value="${o.fileId}">${o.label}</option>`
    ).join("");

    return `
        <div class="unm-file unm-file--pairable">
            <div class="unm-filename">${filename}</div>
            ${folder ? `<div class="unm-folder">${folder}</div>` : ""}
            <div class="unm-row2">
                <div class="unm-chips">${chips}</div>
                <div class="unm-eps"><span class="unm-ep-badge unm-ep-none">No episode match</span></div>
            </div>
            <div class="unm-pair-wrap">
                <button class="unm-pair-toggle">📼 Identify as multi-part</button>
                <div class="unm-pair-form">
                    <div class="unm-pair-field">
                        <span class="unm-pair-lbl">Part of episode:</span>
                        <select class="unm-pair-ep">
                            <option value="">— select —</option>
                            ${epOpts}
                        </select>
                    </div>
                    <div class="unm-pair-field">
                        <span class="unm-pair-lbl">Part number:</span>
                        <div class="unm-part-pills">
                            <button class="unm-part-pill" data-part="2">pt2</button>
                            <button class="unm-part-pill" data-part="3">pt3</button>
                            <button class="unm-part-pill" data-part="4">pt4</button>
                            <button class="unm-part-pill" data-part="5">pt5</button>
                        </div>
                    </div>
                    <div class="unm-rename unm-rename--hidden">
                        <div class="unm-rename-lbl">Rename to:</div>
                        <div class="unm-rename-row">
                            <span class="unm-rename-target"></span>
                            <button class="unm-copy-btn" title="Copy filename">📋</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
}

/** Card: detected multi-part (has -partN in filename) — show rename suggestion */
function buildDetectedCard(item, renameSugg) {
    const { filename, folder } = splitPath(item.relativePath ?? item.path);
    const chips = chipRow(item);
    const m = filename.match(/-?(part\s*\d+)/i);
    const partLabel = m ? m[1].replace(/\s+/, "") : "multi-part";

    const renameBlock = renameSugg
        ? `<div class="unm-rename">
               <div class="unm-rename-lbl">Rename to:</div>
               <div class="unm-rename-row">
                   <span class="unm-rename-target">${renameSugg.suggested}</span>
                   ${copyBtn(renameSugg.suggested)}
               </div>
           </div>`
        : `<div class="unm-rename unm-rename--unknown">
               Episode not yet imported — rename suggestion unavailable
           </div>`;

    return `
        <div class="unm-file unm-file--detected-part">
            <div class="unm-filename">${filename}</div>
            ${folder ? `<div class="unm-folder">${folder}</div>` : ""}
            <div class="unm-row2">
                <div class="unm-chips">${chips}</div>
                <div class="unm-eps"><span class="unm-ep-badge unm-ep-part">${partLabel}</span></div>
            </div>
            ${renameBlock}
        </div>`;
}

/** Card: episode matched but not yet imported by Sonarr */
function buildPendingCard(item) {
    const { filename, folder } = splitPath(item.relativePath ?? item.path);
    const chips = chipRow(item);
    const epBadges = (item.episodes ?? []).map(e =>
        `<span class="unm-ep-badge unm-ep-match">` +
        `S${String(e.seasonNumber).padStart(2,"0")}` +
        `E${String(e.episodeNumber).padStart(2,"0")}` +
        `</span>`
    ).join("");
    return `
        <div class="unm-file unm-file--pending">
            <div class="unm-filename">${filename}</div>
            ${folder ? `<div class="unm-folder">${folder}</div>` : ""}
            <div class="unm-row2">
                <div class="unm-chips">${chips}</div>
                <div class="unm-eps">${epBadges}</div>
            </div>
        </div>`;
}

function buildSection(cls, label, cards) {
    if (!cards.length) return "";
    return `
        <div class="unm-section unm-section--${cls}">
            <div class="unm-section-lbl">${label}</div>
            <div class="unm-card-list">${cards.join("")}</div>
        </div>`;
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function showUnmatchedPanel() {
    document.getElementById("rg-unmatched-panel")?.remove();

    const _spData = getSpData();
    const items   = _spData?.unmatchedFiles ?? [];
    const files   = _spData?.files  ?? [];
    const epMap   = _spData?.epMap  ?? new Map();

    const panel = document.createElement("div");
    panel.id = "rg-unmatched-panel";

    // Classify
    const unmatched    = [];  // no ep match, no -part → needs pairing
    const detectedPart = [];  // no ep match, has -part → rename suggestion
    const pending      = [];  // has ep match → Sonarr will handle

    for (const item of items) {
        const { filename } = splitPath(item.relativePath ?? item.path);
        if (item.episodes?.length > 0)   pending.push(item);
        else if (isMultiPart(filename))  detectedPart.push(item);
        else                              unmatched.push(item);
    }

    const episodeOptions = buildEpisodeOptions(files, epMap);

    const unmatchedCards    = unmatched.map(i => buildUnmatchedCard(i, episodeOptions));
    const detectedPartCards = detectedPart.map(i => buildDetectedCard(i, buildDetectedRename(i, files, epMap)));
    const pendingCards      = pending.map(i => buildPendingCard(i));

    const headerDetail = [
        unmatched.length    ? `<span class="unm-hcount unm-hcount--warn">${unmatched.length} unmatched</span>`    : "",
        detectedPart.length ? `<span class="unm-hcount unm-hcount--part">${detectedPart.length} multi-part</span>` : "",
        pending.length      ? `<span class="unm-hcount unm-hcount--ok">${pending.length} pending</span>`           : "",
    ].filter(Boolean).join("");

    const body = items.length === 0
        ? `<p class="unm-empty">No unmatched files found in series folder.</p>`
        : buildSection("problem",   "⚠ No episode match", unmatchedCards) +
          buildSection("multipart", "📼 Multi-part detected", detectedPartCards) +
          buildSection("pending",   "✓ Pending Sonarr import", pendingCards);

    panel.innerHTML = `
        <div class="rfp-head" style="color:#f80;border-bottom-color:#3a2000">
            <span>📁 ${items.length} file${items.length !== 1 ? "s" : ""} not yet imported</span>
            <span class="rfp-head-close">✕</span>
        </div>
        <div class="rfp-body">
            ${headerDetail ? `<div class="unm-summary">${headerDetail}</div>` : ""}
            <p class="rfp-desc">
                Files in the series folder that Sonarr hasn't imported.
                Use <b>📼 Identify as multi-part</b> to pair a file with its episode
                and get the correct Plex-compatible target filename.
            </p>
            <div class="unm-file-list">${body}</div>
        </div>
        <div style="padding:10px 13px 14px;flex-shrink:0;display:flex;gap:8px">
            <button class="rfp-btn rfp-cancel" id="unm-close">Close</button>
        </div>`;

    // Stash episode options for event handler access
    panel._epOpts = episodeOptions;

    document.body.appendChild(panel);
    requestAnimationFrame(() => panel.classList.add("open"));

    // ── Close ─────────────────────────────────────────────────────────────────
    panel.querySelector(".rfp-head-close").addEventListener("click", () => panel.classList.remove("open"));
    panel.querySelector("#unm-close").addEventListener("click",      () => panel.classList.remove("open"));

    // ── Pairing preview update ────────────────────────────────────────────────
    function updatePreview(card) {
        const select     = card.querySelector(".unm-pair-ep");
        const activePill = card.querySelector(".unm-part-pill.active");
        const renameDiv  = card.querySelector(".unm-rename");
        const targetSpan = card.querySelector(".unm-rename-target");
        const btn        = card.querySelector(".unm-copy-btn");

        const fileId = parseInt(select?.value);
        const partN  = activePill ? parseInt(activePill.dataset.part) : null;

        if (!fileId || !partN) {
            renameDiv?.classList.add("unm-rename--hidden");
            return;
        }
        const opt = panel._epOpts.find(o => o.fileId === fileId);
        if (!opt) return;

        const target = computeTargetName(opt.file, partN);
        if (!target) return;

        if (targetSpan) targetSpan.textContent = target;
        if (btn)        btn.dataset.copy = target;
        renameDiv?.classList.remove("unm-rename--hidden");
    }

    // ── Event delegation ──────────────────────────────────────────────────────
    panel.addEventListener("click", e => {
        // Toggle pairing form
        if (e.target.closest(".unm-pair-toggle")) {
            const wrap = e.target.closest(".unm-pair-wrap");
            wrap?.querySelector(".unm-pair-form")?.classList.toggle("open");
            e.target.closest(".unm-pair-toggle")?.classList.toggle("active");
            return;
        }

        // Part pill selection
        const pill = e.target.closest(".unm-part-pill");
        if (pill) {
            pill.closest(".unm-part-pills")
                .querySelectorAll(".unm-part-pill")
                .forEach(p => p.classList.remove("active"));
            pill.classList.add("active");
            updatePreview(pill.closest(".unm-file"));
            return;
        }

        // Copy to clipboard
        const btn = e.target.closest(".unm-copy-btn");
        if (btn?.dataset.copy) {
            navigator.clipboard.writeText(btn.dataset.copy).then(() => {
                const orig = btn.textContent;
                btn.textContent = "✓";
                btn.classList.add("copied");
                setTimeout(() => { btn.textContent = orig; btn.classList.remove("copied"); }, 1500);
            }).catch(() => {
                // Fallback: select the text visually
                try {
                    const range = document.createRange();
                    range.selectNode(btn.previousElementSibling ?? btn);
                    window.getSelection()?.removeAllRanges();
                    window.getSelection()?.addRange(range);
                } catch (_) {}
            });
        }
    });

    panel.addEventListener("change", e => {
        if (e.target.closest(".unm-pair-ep")) {
            updatePreview(e.target.closest(".unm-file"));
        }
    });
}
