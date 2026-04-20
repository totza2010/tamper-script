"use strict";

import { getSpData } from "./state.js";
import { apiReq } from "./api.js";

// ── Plex multi-part suffixes: cdX, discX, diskX, dvdX, partX, ptX ────────────
// ref: https://support.plex.tv/articles/200220677-local-media-assets-movies/
const MULTI_PART_RE = /[-\s._(](cd|disc|disk|dvd|part|pt)\d+(\b|[_.\-]|$)/i;

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
    return idx < 0
        ? { filename: norm, folder: "" }
        : { filename: norm.slice(idx + 1), folder: norm.slice(0, idx) };
}

function isMultiPart(filename) { return MULTI_PART_RE.test(filename); }

function extractPartLabel(filename) {
    const m = filename.match(/(cd|disc|disk|dvd|part|pt)\s*(\d+)/i);
    return m ? `${m[1].toLowerCase()}${m[2]}` : "multi-part";
}

function parseSeasonEp(filename) {
    const m = filename.match(/S(\d+)E(\d+)/i);
    return m ? { sn: parseInt(m[1]), ep: parseInt(m[2]) } : null;
}

function extractPartNum(filename) {
    const m = filename.match(/(cd|disc|disk|dvd|part|pt)\s*(\d+)/i);
    return m ? parseInt(m[2]) : null;
}

function computeTargetName(importedFile, partNum) {
    const { filename } = splitPath(importedFile.relativePath ?? "");
    if (!filename) return null;
    const dot  = filename.lastIndexOf(".");
    const base = dot >= 0 ? filename.slice(0, dot) : filename;
    const ext  = dot >= 0 ? filename.slice(dot)    : ".mkv";
    return `${base} - pt${partNum}${ext}`;
}

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

// ── Persistent storage (GM_getValue / GM_setValue) ────────────────────────────
// Decisions survive page reload until the file is no longer in the unmatched list.

const UNM_KEY = sid => `unm_dec_${sid}`;

function loadDecisions(sid) {
    try { return JSON.parse(GM_getValue(UNM_KEY(sid), "{}")); } catch { return {}; }
}
function saveDecision(sid, path, dec) {
    const all = loadDecisions(sid); all[path] = dec;
    GM_setValue(UNM_KEY(sid), JSON.stringify(all));
}
function clearDecision(sid, path) {
    const all = loadDecisions(sid); delete all[path];
    GM_setValue(UNM_KEY(sid), JSON.stringify(all));
}
/** Remove stored decisions whose files are no longer in the unmatched list. */
function pruneDecisions(sid, activePaths) {
    const all = loadDecisions(sid);
    let dirty = false;
    for (const k of Object.keys(all)) {
        if (!activePaths.has(k)) { delete all[k]; dirty = true; }
    }
    if (dirty) GM_setValue(UNM_KEY(sid), JSON.stringify(all));
    return all;
}

// ── HTML building blocks ──────────────────────────────────────────────────────

function esc(s) {
    return String(s ?? "")
        .replace(/&/g,"&amp;").replace(/"/g,"&quot;")
        .replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function chipRow(item) {
    const size    = fmtSize(item.size);
    const quality = item.quality?.quality?.name ?? "";
    return [
        size    ? `<span class="unm-chip unm-chip-size">${size}</span>`       : "",
        quality ? `<span class="unm-chip unm-chip-quality">${quality}</span>` : "",
    ].filter(Boolean).join("");
}

function renameBox(target, hidden = false) {
    return `
        <div class="unm-rename${hidden ? " unm-rename--hidden" : ""}">
            <div class="unm-rename-lbl">Rename to:</div>
            <div class="unm-rename-row">
                <span class="unm-rename-target">${esc(target)}</span>
                <button class="unm-copy-btn" ${target ? `data-copy="${esc(target)}"` : ""} title="Copy filename">📋</button>
            </div>
        </div>`;
}

/**
 * Render the interactive decision section for an unmatched card.
 *
 * States:
 *   null                    → 4 action buttons
 *   { type:"multipart-picking" } → pairing form (transient, not persisted)
 *   { type:"multipart", episodeFileId, partNum, targetName } → compact badge + rename
 *   { type:"version"|"ignore"|"delete" } → badge + note + undo
 */
function renderDecisionWrap(dec, epOpts) {
    // ── No decision yet ───────────────────────────────────────────────────────
    if (!dec) {
        return `<div class="unm-decision-wrap">
            <div class="unm-action-btns">
                <button class="unm-act unm-act--part"    data-action="multipart">📼 Multi-part</button>
                <button class="unm-act unm-act--version" data-action="version">🔀 Multi-version</button>
                <button class="unm-act unm-act--ignore"  data-action="ignore">👁 Ignore</button>
                <button class="unm-act unm-act--delete"  data-action="delete">🗑 Flag to delete</button>
            </div>
        </div>`;
    }

    // ── Picking episode / part (transient) ───────────────────────────────────
    if (dec.type === "multipart-picking") {
        const epOpsHtml = epOpts.map(o =>
            `<option value="${o.fileId}">${esc(o.label)}</option>`
        ).join("");
        return `<div class="unm-decision-wrap">
            <div class="unm-decision unm-decision--multipart">
                <div class="unm-decision-head">
                    <span class="unm-decision-badge">📼 Multi-part</span>
                    <button class="unm-undo-btn" title="Cancel">× cancel</button>
                </div>
                <div class="unm-pair-form open">
                    <div class="unm-pair-field">
                        <span class="unm-pair-lbl">Part of episode:</span>
                        <select class="unm-pair-ep">
                            <option value="">— select —</option>
                            ${epOpsHtml}
                        </select>
                    </div>
                    <div class="unm-pair-field">
                        <span class="unm-pair-lbl">Part number:</span>
                        <div class="unm-part-pills">
                            ${[2,3,4,5].map(n =>
                                `<button class="unm-part-pill" data-part="${n}">pt${n}</button>`
                            ).join("")}
                        </div>
                    </div>
                    ${renameBox("", true)}
                </div>
            </div>
        </div>`;
    }

    // ── Multi-part confirmed (persisted) ─────────────────────────────────────
    if (dec.type === "multipart") {
        const ep = epOpts.find(o => o.fileId === dec.episodeFileId);
        const epTag = ep
            ? `S${String(ep.sn).padStart(2,"0")}E${String(ep.ep).padStart(2,"0")}`
            : "";
        return `<div class="unm-decision-wrap">
            <div class="unm-decision unm-decision--multipart">
                <div class="unm-decision-head">
                    <span class="unm-decision-badge">📼 pt${dec.partNum}${epTag ? ` of ${epTag}` : ""}</span>
                    <button class="unm-undo-btn">× undo</button>
                </div>
                ${renameBox(dec.targetName)}
            </div>
        </div>`;
    }

    // ── Other decisions ───────────────────────────────────────────────────────
    const CFG = {
        version: { icon: "🔀", label: "Multi-version",  cls: "version",
                   note: "An alternative version of the already-imported episode." },
        ignore:  { icon: "👁", label: "Ignored",        cls: "ignore",  note: "" },
        delete:  { icon: "🗑", label: "Flag to delete", cls: "delete",
                   note: "Remove this file from the series folder — it has no use here." },
    };
    const cfg = CFG[dec.type] ?? CFG.ignore;
    return `<div class="unm-decision-wrap">
        <div class="unm-decision unm-decision--${cfg.cls}">
            <div class="unm-decision-head">
                <span class="unm-decision-badge">${cfg.icon} ${cfg.label}</span>
                <button class="unm-undo-btn">× undo</button>
            </div>
            ${cfg.note ? `<div class="unm-decision-note">${cfg.note}</div>` : ""}
        </div>
    </div>`;
}

// ── Card builders ─────────────────────────────────────────────────────────────

/** Unmatched card — no episode match, no multi-part pattern detected. User classifies. */
function buildUnmatchedCard(item, dec, epOpts) {
    const path = item.relativePath ?? item.path ?? "";
    const { filename, folder } = splitPath(path);
    return `<div class="unm-file unm-file--pairable" data-path="${esc(encodeURIComponent(path))}">
        <div class="unm-filename">${esc(filename)}</div>
        ${folder ? `<div class="unm-folder">${esc(folder)}</div>` : ""}
        <div class="unm-row2">
            <div class="unm-chips">${chipRow(item)}</div>
            <div class="unm-eps"><span class="unm-ep-badge unm-ep-none">No episode match</span></div>
        </div>
        ${renderDecisionWrap(dec, epOpts)}
    </div>`;
}

/** Detected multi-part card — has -partN / ptN / etc. in filename. */
function buildDetectedCard(item, renameSugg) {
    const { filename, folder } = splitPath(item.relativePath ?? item.path);
    const partLabel = extractPartLabel(filename);
    const renameBlock = renameSugg
        ? renameBox(renameSugg.suggested)
        : `<div class="unm-rename unm-rename--unknown">Episode not yet imported — suggestion unavailable</div>`;
    return `<div class="unm-file unm-file--detected-part">
        <div class="unm-filename">${esc(filename)}</div>
        ${folder ? `<div class="unm-folder">${esc(folder)}</div>` : ""}
        <div class="unm-row2">
            <div class="unm-chips">${chipRow(item)}</div>
            <div class="unm-eps"><span class="unm-ep-badge unm-ep-part">${esc(partLabel)}</span></div>
        </div>
        ${renameBlock}
    </div>`;
}

/** Pending card — episode matched, Sonarr hasn't imported yet. */
function buildPendingCard(item) {
    const { filename, folder } = splitPath(item.relativePath ?? item.path);
    const epBadges = (item.episodes ?? []).map(e =>
        `<span class="unm-ep-badge unm-ep-match">` +
        `S${String(e.seasonNumber).padStart(2,"0")}` +
        `E${String(e.episodeNumber).padStart(2,"0")}</span>`
    ).join("");
    return `<div class="unm-file unm-file--pending">
        <div class="unm-filename">${esc(filename)}</div>
        ${folder ? `<div class="unm-folder">${esc(folder)}</div>` : ""}
        <div class="unm-row2">
            <div class="unm-chips">${chipRow(item)}</div>
            <div class="unm-eps">${epBadges}</div>
        </div>
    </div>`;
}

function buildSection(cls, label, cards) {
    if (!cards.length) return "";
    return `<div class="unm-section unm-section--${cls}">
        <div class="unm-section-lbl">${label}</div>
        <div class="unm-card-list">${cards.join("")}</div>
    </div>`;
}

// ── API ───────────────────────────────────────────────────────────────────────

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

        const noEpMatch = items.filter(i => !(i.episodes?.length > 0)).length;
        if (noEpMatch > 0) {
            btn.classList.add("visible", "has-unmatched");
            btn.dataset.count = noEpMatch;
            btn.title = `${noEpMatch} file${noEpMatch > 1 ? "s" : ""} with no episode match`;
        } else {
            btn.classList.remove("visible", "has-unmatched");
            delete btn.dataset.count;
        }
    } catch (e) { console.warn("[RG Unmatched]", e.message); }
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function showUnmatchedPanel() {
    document.getElementById("rg-unmatched-panel")?.remove();

    const _spData  = getSpData();
    const items    = _spData?.unmatchedFiles ?? [];
    const files    = _spData?.files  ?? [];
    const epMap    = _spData?.epMap  ?? new Map();
    const sid      = _spData?.series?.id;

    // Prune stale decisions; load remaining
    const activePaths = new Set(items.map(i => i.relativePath ?? i.path ?? "").filter(Boolean));
    const decisions = sid ? pruneDecisions(sid, activePaths) : {};

    const panel = document.createElement("div");
    panel.id = "rg-unmatched-panel";

    // Classify
    const unmatched = [], detectedPart = [], pending = [];
    for (const item of items) {
        const { filename } = splitPath(item.relativePath ?? item.path);
        if      (item.episodes?.length > 0) pending.push(item);
        else if (isMultiPart(filename))     detectedPart.push(item);
        else                                unmatched.push(item);
    }

    const epOpts = buildEpisodeOptions(files, epMap);
    panel._epOpts = epOpts;
    panel._sid    = sid;

    const unmCards  = unmatched.map(i =>
        buildUnmatchedCard(i, decisions[i.relativePath ?? i.path ?? ""] ?? null, epOpts));
    const detCards  = detectedPart.map(i => buildDetectedCard(i, buildDetectedRename(i, files, epMap)));
    const pendCards = pending.map(i => buildPendingCard(i));

    const summary = [
        unmatched.length    ? `<span class="unm-hcount unm-hcount--warn">${unmatched.length} unmatched</span>`     : "",
        detectedPart.length ? `<span class="unm-hcount unm-hcount--part">${detectedPart.length} multi-part</span>` : "",
        pending.length      ? `<span class="unm-hcount unm-hcount--ok">${pending.length} pending</span>`           : "",
    ].filter(Boolean).join("");

    const body = items.length === 0
        ? `<p class="unm-empty">No unmatched files found in series folder.</p>`
        : buildSection("problem",   "⚠ No episode match", unmCards) +
          buildSection("multipart", "📼 Multi-part detected", detCards) +
          buildSection("pending",   "✓ Pending Sonarr import", pendCards);

    panel.innerHTML = `
        <div class="rfp-head" style="color:#f80;border-bottom-color:#3a2000">
            <span>📁 ${items.length} file${items.length !== 1 ? "s" : ""} not yet imported</span>
            <span class="rfp-head-close">✕</span>
        </div>
        <div class="rfp-body">
            ${summary ? `<div class="unm-summary">${summary}</div>` : ""}
            <p class="rfp-desc">
                Files in the series folder that Sonarr hasn't imported.
                Classify each unmatched file — paired multi-part decisions are remembered
                across page loads until the file is renamed or removed.
            </p>
            <div class="unm-file-list">${body}</div>
        </div>
        <div style="padding:10px 13px 14px;flex-shrink:0">
            <button class="rfp-btn rfp-cancel" id="unm-close">Close</button>
        </div>`;

    document.body.appendChild(panel);
    requestAnimationFrame(() => panel.classList.add("open"));

    panel.querySelector(".rfp-head-close").addEventListener("click", () => panel.classList.remove("open"));
    panel.querySelector("#unm-close").addEventListener("click",      () => panel.classList.remove("open"));

    // ── Swap decision wrap helper ─────────────────────────────────────────────
    function swapWrap(card, html) {
        const old = card.querySelector(".unm-decision-wrap");
        if (!old) return;
        old.insertAdjacentHTML("afterend", html);
        old.remove();
    }

    // ── Update rename preview + auto-save when ep + part are both selected ────
    function tryUpdateRename(card) {
        const select     = card.querySelector(".unm-pair-ep");
        const activePill = card.querySelector(".unm-part-pill.active");
        const renameDiv  = card.querySelector(".unm-rename");
        const targetSpan = card.querySelector(".unm-rename-target");
        const btn        = card.querySelector(".unm-copy-btn");

        const fileId = parseInt(select?.value);
        const partN  = activePill ? parseInt(activePill.dataset.part) : null;

        if (!fileId || !partN) { renameDiv?.classList.add("unm-rename--hidden"); return; }

        const opt = panel._epOpts.find(o => o.fileId === fileId);
        if (!opt) return;
        const target = computeTargetName(opt.file, partN);
        if (!target) return;

        if (targetSpan) targetSpan.textContent = target;
        if (btn)        btn.dataset.copy = target;
        renameDiv?.classList.remove("unm-rename--hidden");

        // Persist decision
        if (panel._sid) {
            const path = decodeURIComponent(card.dataset.path ?? "");
            saveDecision(panel._sid, path, {
                type: "multipart", episodeFileId: fileId, partNum: partN, targetName: target,
            });
        }
    }

    // ── Event delegation ──────────────────────────────────────────────────────
    panel.addEventListener("click", e => {

        // Action buttons
        const actBtn = e.target.closest(".unm-act");
        if (actBtn) {
            const card   = actBtn.closest(".unm-file");
            const path   = decodeURIComponent(card.dataset.path ?? "");
            const action = actBtn.dataset.action;
            if (action === "multipart") {
                swapWrap(card, renderDecisionWrap({ type: "multipart-picking" }, panel._epOpts));
            } else {
                const dec = { type: action };
                if (panel._sid) saveDecision(panel._sid, path, dec);
                swapWrap(card, renderDecisionWrap(dec, panel._epOpts));
            }
            return;
        }

        // Part number pill
        const pill = e.target.closest(".unm-part-pill");
        if (pill) {
            pill.closest(".unm-part-pills")
                .querySelectorAll(".unm-part-pill")
                .forEach(p => p.classList.remove("active"));
            pill.classList.add("active");
            tryUpdateRename(pill.closest(".unm-file"));
            return;
        }

        // Undo / cancel
        const undoBtn = e.target.closest(".unm-undo-btn");
        if (undoBtn) {
            const card = undoBtn.closest(".unm-file");
            const path = decodeURIComponent(card.dataset.path ?? "");
            if (panel._sid) clearDecision(panel._sid, path);
            swapWrap(card, renderDecisionWrap(null, panel._epOpts));
            return;
        }

        // Copy to clipboard
        const copyBtn = e.target.closest(".unm-copy-btn");
        if (copyBtn?.dataset.copy) {
            navigator.clipboard.writeText(copyBtn.dataset.copy).then(() => {
                const orig = copyBtn.textContent;
                copyBtn.textContent = "✓";
                copyBtn.classList.add("copied");
                setTimeout(() => { copyBtn.textContent = orig; copyBtn.classList.remove("copied"); }, 1500);
            }).catch(() => {
                try {
                    const range = document.createRange();
                    range.selectNode(copyBtn.previousElementSibling ?? copyBtn);
                    window.getSelection()?.removeAllRanges();
                    window.getSelection()?.addRange(range);
                } catch (_) {}
            });
        }
    });

    panel.addEventListener("change", e => {
        if (e.target.closest(".unm-pair-ep"))
            tryUpdateRename(e.target.closest(".unm-file"));
    });
}
