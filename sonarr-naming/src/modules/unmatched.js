"use strict";

import { getSpData } from "./state.js";
import { apiReq } from "./api.js";
import { showToast } from "./utils.js";

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

/**
 * Extract the part format keyword from a filename.
 * e.g. "...-part1-..." → "part"
 *      "...-pt2-..."   → "pt"
 *      "...-cd1..."    → "cd"
 * Defaults to "part" if nothing is found.
 */
function extractPartFormat(filename) {
    const m = filename.match(/(cd|disc|disk|dvd|part|pt)\s*\d+/i);
    return m ? m[1].toLowerCase() : "part";
}

/**
 * Strip any leading part indicator from a release-group string.
 * e.g. "part2-AudioJASubTHEN" → "AudioJASubTHEN"
 *      "AudioJASubTHEN"       → "AudioJASubTHEN"  (no change)
 */
function stripPartFromRG(rg) {
    const stripped = (rg ?? "")
        .replace(/^(cd|disc|disk|dvd|part|pt)\d+-?/i, "")
        .replace(/^-/, "");
    return stripped || (rg ?? "");
}

/**
 * Compute a rename target by inserting "-{format}{N}" between
 * {[Custom Formats]} and {-Release Group} in the Sonarr episode-file name.
 */
function computeTargetName(importedFile, partNum, format = "pt") {
    const { filename } = splitPath(importedFile.relativePath ?? "");
    if (!filename) return null;
    const dot = filename.lastIndexOf(".");
    const ext = dot >= 0 ? filename.slice(dot) : ".mkv";
    let base   = dot >= 0 ? filename.slice(0, dot) : filename;

    // Strip any existing part indicator from the base name
    base = base
        .replace(/-(cd|disc|disk|dvd|part|pt)\d+/gi, "")
        .replace(/-{2,}/g, "-")
        .replace(/-$/, "");

    // Get the clean base release-group (strip leading "part2-" etc. if present)
    const baseRG = stripPartFromRG(importedFile.releaseGroup);

    // Build the new part+RG token using the caller-supplied format
    const partToken = `${format}${partNum}`;

    if (baseRG) {
        const rgSuffix = `-${baseRG}`;
        if (base.endsWith(rgSuffix)) {
            return `${base.slice(0, base.length - rgSuffix.length)}-${partToken}-${baseRG}${ext}`;
        }
        if (base.toLowerCase().endsWith(rgSuffix.toLowerCase())) {
            return `${base.slice(0, base.length - rgSuffix.length)}-${partToken}-${baseRG}${ext}`;
        }
    }

    // Last resort: append
    return `${base} - ${partToken}${ext}`;
}

/**
 * If the Sonarr-imported file for the same SxxExx episode ALSO carries a Plex
 * multi-part indicator, the two files already form a valid Plex pair — no
 * rename is required.  Returns that matched file, or null.
 */
function detectPairedFile(item, files, epMap) {
    const { filename } = splitPath(item.relativePath ?? item.path ?? "");
    const parsed = parseSeasonEp(filename);
    if (!parsed) return null;

    for (const [fileId, episodes] of epMap) {
        if (!episodes.some(e => e.seasonNumber === parsed.sn && e.episodeNumber === parsed.ep)) continue;
        const mf = files.find(f => f.id === fileId);
        if (!mf) continue;
        const { filename: mfn } = splitPath(mf.relativePath ?? "");
        if (isMultiPart(mfn)) return mf;   // both files have part indicators → already paired
    }
    return null;
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
function pruneDecisions(sid, activePaths) {
    const all = loadDecisions(sid);
    let dirty = false;
    for (const k of Object.keys(all)) {
        if (!activePaths.has(k)) { delete all[k]; dirty = true; }
    }
    if (dirty) GM_setValue(UNM_KEY(sid), JSON.stringify(all));
    return all;
}

// ── HTML helpers ──────────────────────────────────────────────────────────────

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

// ── Decision wrap for UNMATCHED cards ─────────────────────────────────────────

function renderDecisionWrap(dec, epOpts) {
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

// ── Decision wrap for DETECTED multi-part cards ───────────────────────────────

/**
 * @param {object|null} dec
 * @param {Array}       epOpts
 * @param {number}      thisPartNum  – auto-detected from the unmatched file's name
 * @param {boolean}     autoPaired   – true when the Sonarr-matched file already
 *                                     carries a Plex part indicator (S02E06 case)
 * @param {object|null} pairedInfo   – { thisFilename, pairFilename,
 *                                       thisPartLabel, pairPartLabel }
 *                                     when autoPaired and we have the partner's info
 */
function renderDetectedDecisionWrap(dec, epOpts, thisPartNum, autoPaired = false, pairedInfo = null) {
    // ── No decision yet ───────────────────────────────────────────────────────
    if (!dec) {
        if (autoPaired && pairedInfo) {
            // Already a valid Plex pair — show same confirmed-pairing style as S02E04
            return `<div class="unm-decision-wrap">
                <div class="unm-decision unm-decision--multipart">
                    <div class="unm-decision-head">
                        <span class="unm-decision-badge">📼 ${esc(pairedInfo.thisPartLabel)} + ${esc(pairedInfo.pairPartLabel)}</span>
                    </div>
                    <div class="unm-rename-lbl" style="margin-top:6px">This file:</div>
                    <div class="unm-rename-row">
                        <span class="unm-rename-target">${esc(pairedInfo.thisFilename)}</span>
                    </div>
                    <div class="unm-rename-lbl" style="margin-top:6px">Sonarr file:</div>
                    <div class="unm-rename-row">
                        <span class="unm-rename-target">${esc(pairedInfo.pairFilename)}</span>
                    </div>
                </div>
                <div class="unm-action-btns" style="margin-top:5px">
                    <button class="unm-act unm-act--ignore" data-action="ignore">👁 Acknowledge</button>
                </div>
            </div>`;
        }
        if (autoPaired) {
            // Fallback when pairedInfo not available
            return `<div class="unm-decision-wrap">
                <div class="unm-action-btns">
                    <button class="unm-act unm-act--ignore" data-action="ignore">👁 Acknowledge</button>
                </div>
            </div>`;
        }
        return `<div class="unm-decision-wrap">
            <div class="unm-action-btns">
                <button class="unm-act unm-act--part" data-action="det-pair">📼 Pair with episode</button>
                <button class="unm-act unm-act--ignore" data-action="ignore">👁 Ignore</button>
            </div>
        </div>`;
    }

    // ── Picking (transient form) ───────────────────────────────────────────────
    if (dec.type === "det-picking") {
        const defaultSonarrPart = thisPartNum === 1 ? 2 : 1;
        const epOpsHtml = epOpts.map(o =>
            `<option value="${o.fileId}">${esc(o.label)}</option>`
        ).join("");
        return `<div class="unm-decision-wrap">
            <div class="unm-decision unm-decision--multipart">
                <div class="unm-decision-head">
                    <span class="unm-decision-badge">📼 Pairing…</span>
                    <button class="unm-undo-btn" title="Cancel">× cancel</button>
                </div>
                <div class="unm-pair-form open">
                    <div class="unm-pair-field">
                        <span class="unm-pair-lbl">This file is part:</span>
                        <div class="unm-part-pills" data-role="this">
                            ${[1,2,3,4,5].map(n =>
                                `<button class="unm-part-pill${n === thisPartNum ? " active" : ""}" data-part="${n}">pt${n}</button>`
                            ).join("")}
                        </div>
                    </div>
                    <div class="unm-pair-field">
                        <span class="unm-pair-lbl">Belongs to episode:</span>
                        <select class="unm-pair-ep">
                            <option value="">— select episode —</option>
                            ${epOpsHtml}
                        </select>
                    </div>
                    <div class="unm-pair-field">
                        <span class="unm-pair-lbl">Sonarr file is part:</span>
                        <div class="unm-part-pills" data-role="sonarr">
                            ${[1,2,3,4,5].map(n =>
                                `<button class="unm-part-pill${n === defaultSonarrPart ? " active" : ""}" data-part="${n}">pt${n}</button>`
                            ).join("")}
                        </div>
                    </div>
                    <!-- Preview appears here once all three fields are set -->
                    <div class="unm-det-preview unm-rename--hidden"></div>
                    <button class="unm-det-confirm-btn" disabled>✓ Confirm pairing</button>
                </div>
            </div>
        </div>`;
    }

    // ── Confirmed pairing ─────────────────────────────────────────────────────
    if (dec.type === "det-multipart") {
        const ep = epOpts.find(o => o.fileId === dec.episodeFileId);
        const epTag = ep
            ? `S${String(ep.sn).padStart(2,"0")}E${String(ep.ep).padStart(2,"0")}`
            : "";
        const pf = dec.partFormat ?? "pt";

        // After Sonarr rename completed — remove action buttons, show ✓ indicators
        if (dec.sonarrRenamed) {
            return `<div class="unm-decision-wrap">
                <div class="unm-decision unm-decision--multipart">
                    <div class="unm-decision-head">
                        <span class="unm-decision-badge">📼 ${pf}${dec.thisPartNum}${epTag ? ` of ${epTag}` : ""}</span>
                        <button class="unm-undo-btn">× undo</button>
                    </div>
                    <div class="unm-rename-lbl" style="margin-top:6px">This file — rename manually:</div>
                    <div class="unm-rename-row">
                        <span class="unm-rename-target">${esc(dec.thisTargetName)}</span>
                        <button class="unm-copy-btn" data-copy="${esc(dec.thisTargetName)}" title="Copy filename">📋</button>
                    </div>
                    <div class="unm-rename-lbl" style="margin-top:6px">Sonarr file ${pf}${dec.sonarrPartNum}:</div>
                    <div class="unm-rename-row">
                        <span class="unm-rename-target">${esc(dec.sonarrTargetName)}</span>
                        <span class="unm-renamed-ok">✓ renamed</span>
                    </div>
                </div>
            </div>`;
        }

        // Normal confirmed state — copy btn for this file, API rename btn for Sonarr file
        return `<div class="unm-decision-wrap">
            <div class="unm-decision unm-decision--multipart">
                <div class="unm-decision-head">
                    <span class="unm-decision-badge">📼 ${pf}${dec.thisPartNum}${epTag ? ` of ${epTag}` : ""}</span>
                    <button class="unm-undo-btn">× undo</button>
                </div>
                <div class="unm-rename-lbl" style="margin-top:6px">This file — copy &amp; rename manually:</div>
                <div class="unm-rename-row">
                    <span class="unm-rename-target">${esc(dec.thisTargetName)}</span>
                    <button class="unm-copy-btn" data-copy="${esc(dec.thisTargetName)}" title="Copy filename">📋</button>
                </div>
                <div class="unm-rename-lbl" style="margin-top:6px">Sonarr file ${pf}${dec.sonarrPartNum} — rename via API:</div>
                <div class="unm-rename-row">
                    <span class="unm-rename-target">${esc(dec.sonarrTargetName)}</span>
                    <button class="unm-api-rename-btn"
                        data-fileid="${dec.episodeFileId}"
                        data-partnum="${dec.sonarrPartNum}"
                        data-rg="${esc(dec.sonarrOriginalRG ?? "")}"
                        data-format="${esc(pf)}"
                        title="Update release group and trigger Sonarr rename">↺ Rename</button>
                </div>
            </div>
        </div>`;
    }

    // ── Ignored / acknowledged ────────────────────────────────────────────────
    return `<div class="unm-decision-wrap">
        <div class="unm-decision unm-decision--ignore">
            <div class="unm-decision-head">
                <span class="unm-decision-badge">👁 ${autoPaired ? "Acknowledged" : "Ignored"}</span>
                <button class="unm-undo-btn">× undo</button>
            </div>
        </div>
    </div>`;
}

// ── Card builders ─────────────────────────────────────────────────────────────

function buildUnmatchedCard(item, dec, epOpts) {
    const path = item.relativePath ?? item.path ?? "";
    const { filename, folder } = splitPath(path);
    const decType = dec?.type ?? "";
    return `<div class="unm-file unm-file--pairable" data-path="${esc(encodeURIComponent(path))}" data-decision="${esc(decType)}">
        <div class="unm-filename">${esc(filename)}</div>
        ${folder ? `<div class="unm-folder">${esc(folder)}</div>` : ""}
        <div class="unm-row2">
            <div class="unm-chips">${chipRow(item)}</div>
            <div class="unm-eps"><span class="unm-ep-badge unm-ep-none">No episode match</span></div>
        </div>
        ${renderDecisionWrap(dec, epOpts)}
    </div>`;
}

/**
 * @param {object}      item
 * @param {object|null} dec
 * @param {Array}       epOpts
 * @param {object|null} pairedFile  – when not null, the Sonarr file for the same
 *                                    episode already has a Plex part indicator, so
 *                                    these two files are an existing Plex pair.
 */
function buildDetectedCard(item, dec, epOpts, pairedFile) {
    const path = item.relativePath ?? item.path ?? "";
    const { filename, folder } = splitPath(path);
    const partLabel   = extractPartLabel(filename);
    const thisPartNum = extractPartNum(filename) ?? 1;
    const partFormat  = extractPartFormat(filename);   // "part" / "pt" / "cd" / …
    const autoPaired  = !!pairedFile;
    const decType     = dec?.type ?? (autoPaired ? "auto-paired" : "");

    // Build pairedInfo for auto-paired cards so we can render the partner filename
    let pairedInfo = null;
    let pairFilenameEncoded = "";
    if (autoPaired) {
        const { filename: pfn } = splitPath(pairedFile.relativePath ?? "");
        pairedInfo = {
            thisFilename:  filename,
            pairFilename:  pfn,
            thisPartLabel: extractPartLabel(filename),
            pairPartLabel: extractPartLabel(pfn),
        };
        pairFilenameEncoded = encodeURIComponent(pfn);
    }

    return `<div class="unm-file unm-file--detected-part"
                data-path="${esc(encodeURIComponent(path))}"
                data-this-part="${thisPartNum}"
                data-part-format="${partFormat}"
                data-decision="${esc(decType)}"
                ${autoPaired ? `data-auto-paired="true" data-pair-filename="${esc(pairFilenameEncoded)}"` : ""}>
        <div class="unm-filename">${esc(filename)}</div>
        ${folder ? `<div class="unm-folder">${esc(folder)}</div>` : ""}
        <div class="unm-row2">
            <div class="unm-chips">${chipRow(item)}</div>
            <div class="unm-eps"><span class="unm-ep-badge unm-ep-part">${esc(partLabel)}</span></div>
        </div>
        ${renderDetectedDecisionWrap(dec, epOpts, thisPartNum, autoPaired, pairedInfo)}
    </div>`;
}

function buildPendingCard(item) {
    const { filename, folder } = splitPath(item.relativePath ?? item.path);
    const epBadges = (item.episodes ?? []).map(e =>
        `<span class="unm-ep-badge unm-ep-match">` +
        `S${String(e.seasonNumber).padStart(2,"0")}` +
        `E${String(e.episodeNumber).padStart(2,"0")}</span>`
    ).join("");
    return `<div class="unm-file unm-file--pending" data-decision="pending">
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

// ── Public API ────────────────────────────────────────────────────────────────

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

    const activePaths = new Set(items.map(i => i.relativePath ?? i.path ?? "").filter(Boolean));
    const decisions   = sid ? pruneDecisions(sid, activePaths) : {};

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

    const detCards  = detectedPart.map(i => {
        const pairedFile = detectPairedFile(i, files, epMap);
        return buildDetectedCard(
            i,
            decisions[i.relativePath ?? i.path ?? ""] ?? null,
            epOpts,
            pairedFile,
        );
    });

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

    // ── In-memory temp store for det-picking preview values ───────────────────
    // Keyed by card path; cleared when the decision is confirmed or cancelled.
    const detPickTemp = new Map();

    // ── Helpers ───────────────────────────────────────────────────────────────

    function swapWrap(card, html) {
        const old = card.querySelector(".unm-decision-wrap");
        if (!old) return;
        old.insertAdjacentHTML("afterend", html);
        old.remove();
    }

    function isDetectedCard(card) {
        return card.classList.contains("unm-file--detected-part");
    }
    function isAutoPairedCard(card) {
        return card.dataset.autoPaired === "true";
    }

    /** Reconstruct pairedInfo from card data attributes (for event handlers). */
    function getPairedInfoFromCard(card) {
        if (!isAutoPairedCard(card)) return null;
        const encoded = card.dataset.pairFilename;
        if (!encoded) return null;
        const pairFilename = decodeURIComponent(encoded);
        const thisFilename = card.querySelector(".unm-filename")?.textContent ?? "";
        return {
            thisFilename,
            pairFilename,
            thisPartLabel: extractPartLabel(thisFilename),
            pairPartLabel: extractPartLabel(pairFilename),
        };
    }

    // ── Rename preview for UNMATCHED cards (multipart-picking) ────────────────
    function tryUpdateRename(card) {
        const select     = card.querySelector(".unm-pair-ep");
        const pillGroup  = card.querySelector(".unm-part-pills:not([data-role])");
        const activePill = pillGroup?.querySelector(".unm-part-pill.active");
        const renameDiv  = card.querySelector(".unm-rename");
        const targetSpan = card.querySelector(".unm-rename-target");
        const btn        = card.querySelector(".unm-copy-btn");

        const fileId = parseInt(select?.value);
        const partN  = activePill ? parseInt(activePill.dataset.part) : null;

        if (!fileId || !partN) { renameDiv?.classList.add("unm-rename--hidden"); return; }

        const opt = panel._epOpts.find(o => o.fileId === fileId);
        if (!opt) return;
        // Unmatched cards use "pt" format — the pills are labelled pt2, pt3…
        const target = computeTargetName(opt.file, partN, "pt");
        if (!target) return;

        if (targetSpan) targetSpan.textContent = target;
        if (btn)        btn.dataset.copy = target;
        renameDiv?.classList.remove("unm-rename--hidden");

        if (panel._sid) {
            const path = decodeURIComponent(card.dataset.path ?? "");
            saveDecision(panel._sid, path, {
                type: "multipart", episodeFileId: fileId, partNum: partN, targetName: target,
            });
        }
    }

    // ── Preview for DETECTED cards (det-picking) ──────────────────────────────
    // Shows rename targets in-place; user must click "✓ Confirm pairing" to save.
    function tryUpdateDetRename(card) {
        const select       = card.querySelector(".unm-pair-ep");
        const thisPills    = card.querySelector(".unm-part-pills[data-role='this']");
        const sonarrPills  = card.querySelector(".unm-part-pills[data-role='sonarr']");
        const activeThis   = thisPills?.querySelector(".unm-part-pill.active");
        const activeSonarr = sonarrPills?.querySelector(".unm-part-pill.active");
        const preview      = card.querySelector(".unm-det-preview");
        const confirmBtn   = card.querySelector(".unm-det-confirm-btn");

        const fileId      = parseInt(select?.value);
        const thisPartN   = activeThis   ? parseInt(activeThis.dataset.part)   : null;
        const sonarrPartN = activeSonarr ? parseInt(activeSonarr.dataset.part) : null;

        if (!fileId || !thisPartN || !sonarrPartN) {
            preview?.classList.add("unm-rename--hidden");
            confirmBtn?.setAttribute("disabled", "");
            return;
        }

        const opt = panel._epOpts.find(o => o.fileId === fileId);
        if (!opt) return;

        // Format detected from the unmatched file (e.g. "part", "pt", "cd"…)
        // stored on the card as data-part-format by buildDetectedCard.
        const partFormat = card.dataset.partFormat ?? "part";

        const thisTarget   = computeTargetName(opt.file, thisPartN,   partFormat);
        const sonarrTarget = computeTargetName(opt.file, sonarrPartN, partFormat);
        if (!thisTarget || !sonarrTarget) return;

        // Base RG (without any part prefix) — used by the API rename handler to
        // build "part2-AudioJASubTHEN" via PUT episodefile + RenameFiles.
        const sonarrRG = stripPartFromRG(opt.file.releaseGroup);

        // Store in temp map (not persisted until confirmed)
        const path = decodeURIComponent(card.dataset.path ?? "");
        detPickTemp.set(path, { fileId, thisPartN, sonarrPartN, partFormat, thisTarget, sonarrTarget, sonarrRG });

        if (preview) {
            preview.classList.remove("unm-rename--hidden");
            preview.innerHTML = `
                <div class="unm-rename-lbl">This file — copy &amp; rename manually:</div>
                <div class="unm-rename-row">
                    <span class="unm-rename-target">${esc(thisTarget)}</span>
                    <button class="unm-copy-btn" data-copy="${esc(thisTarget)}" title="Copy filename">📋</button>
                </div>
                <div class="unm-rename-lbl" style="margin-top:5px">Sonarr file ${partFormat}${sonarrPartN} — rename via API:</div>
                <div class="unm-rename-row">
                    <span class="unm-rename-target">${esc(sonarrTarget)}</span>
                </div>`;
        }
        if (confirmBtn) confirmBtn.removeAttribute("disabled");
    }

    // ── Event delegation ──────────────────────────────────────────────────────
    panel.addEventListener("click", async e => {

        // ── Action buttons ────────────────────────────────────────────────────
        const actBtn = e.target.closest(".unm-act");
        if (actBtn) {
            const card   = actBtn.closest(".unm-file");
            const path   = decodeURIComponent(card.dataset.path ?? "");
            const action = actBtn.dataset.action;

            if (action === "multipart") {
                card.dataset.decision = "multipart-picking";
                swapWrap(card, renderDecisionWrap({ type: "multipart-picking" }, panel._epOpts));
            } else if (action === "det-pair") {
                const thisPartNum = parseInt(card.dataset.thisPart) || 1;
                card.dataset.decision = "det-picking";
                swapWrap(card, renderDetectedDecisionWrap(
                    { type: "det-picking" }, panel._epOpts, thisPartNum, false,
                ));
            } else {
                // ignore / version / delete / acknowledge
                const dec = { type: action };
                if (panel._sid) saveDecision(panel._sid, path, dec);
                card.dataset.decision = action;
                if (isDetectedCard(card)) {
                    const thisPartNum = parseInt(card.dataset.thisPart) || 1;
                    swapWrap(card, renderDetectedDecisionWrap(
                        dec, panel._epOpts, thisPartNum, isAutoPairedCard(card),
                        getPairedInfoFromCard(card),
                    ));
                } else {
                    swapWrap(card, renderDecisionWrap(dec, panel._epOpts));
                }
            }
            return;
        }

        // ── Confirm pairing button (det-picking) ──────────────────────────────
        const confirmBtn = e.target.closest(".unm-det-confirm-btn");
        if (confirmBtn && !confirmBtn.disabled) {
            const card = confirmBtn.closest(".unm-file");
            const path = decodeURIComponent(card.dataset.path ?? "");
            const temp = detPickTemp.get(path);
            if (!temp) return;

            const dec = {
                type:             "det-multipart",
                episodeFileId:    temp.fileId,
                thisPartNum:      temp.thisPartN,
                sonarrPartNum:    temp.sonarrPartN,
                partFormat:       temp.partFormat,
                thisTargetName:   temp.thisTarget,
                sonarrTargetName: temp.sonarrTarget,
                sonarrOriginalRG: temp.sonarrRG,
            };
            if (panel._sid) saveDecision(panel._sid, path, dec);
            detPickTemp.delete(path);
            card.dataset.decision = "det-multipart";
            swapWrap(card, renderDetectedDecisionWrap(
                dec, panel._epOpts, temp.thisPartN, isAutoPairedCard(card),
                getPairedInfoFromCard(card),
            ));
            return;
        }

        // ── Part number pill ──────────────────────────────────────────────────
        const pill = e.target.closest(".unm-part-pill");
        if (pill) {
            pill.closest(".unm-part-pills")
                .querySelectorAll(".unm-part-pill")
                .forEach(p => p.classList.remove("active"));
            pill.classList.add("active");
            const card = pill.closest(".unm-file");
            if (isDetectedCard(card)) tryUpdateDetRename(card);
            else                      tryUpdateRename(card);
            return;
        }

        // ── Undo / cancel ─────────────────────────────────────────────────────
        const undoBtn = e.target.closest(".unm-undo-btn");
        if (undoBtn) {
            const card = undoBtn.closest(".unm-file");
            const path = decodeURIComponent(card.dataset.path ?? "");
            if (panel._sid) clearDecision(panel._sid, path);
            detPickTemp.delete(path);
            if (isDetectedCard(card)) {
                const thisPartNum = parseInt(card.dataset.thisPart) || 1;
                const autoPaired  = isAutoPairedCard(card);
                card.dataset.decision = autoPaired ? "auto-paired" : "";
                swapWrap(card, renderDetectedDecisionWrap(
                    null, panel._epOpts, thisPartNum, autoPaired,
                    getPairedInfoFromCard(card),
                ));
            } else {
                card.dataset.decision = "";
                swapWrap(card, renderDecisionWrap(null, panel._epOpts));
            }
            return;
        }

        // ── API rename button ─────────────────────────────────────────────────
        const apiBtn = e.target.closest(".unm-api-rename-btn");
        if (apiBtn && !apiBtn.classList.contains("spinning") && !apiBtn.classList.contains("done")) {
            const fileId     = parseInt(apiBtn.dataset.fileid);
            const partNum    = parseInt(apiBtn.dataset.partnum);
            // data-rg   = base release group WITHOUT any part prefix (e.g. "AudioJASubTHEN")
            // data-format = part format detected from unmatched file (e.g. "part", "pt", "cd"…)
            const origRG     = apiBtn.dataset.rg ?? "";
            const partFormat = apiBtn.dataset.format ?? "part";
            if (!fileId || !partNum) return;

            apiBtn.classList.add("spinning");
            apiBtn.textContent = "…";

            try {
                const spd = getSpData();
                // Build new RG: "part2-AudioJASubTHEN" using the same format
                // keyword the unmatched file already uses, so Sonarr produces a
                // consistent name → {[Custom Formats]}-part2-{Release Group}
                const newRG = origRG ? `${partFormat}${partNum}-${origRG}` : `${partFormat}${partNum}`;

                // PUT /api/v3/episodefile/{id} requires the full EpisodeFileResource
                // (Quality is NOT NULL in the DB).  Fetch the current file first so
                // we can spread all existing fields and only override releaseGroup.
                const currentFile = await apiReq("GET", `/api/v3/episodefile/${fileId}`);
                await apiReq("PUT", `/api/v3/episodefile/${fileId}`, { ...currentFile, releaseGroup: newRG });

                await apiReq("POST", "/api/v3/command", {
                    name:     "RenameFiles",
                    seriesId: spd.series.id,
                    files:    [fileId],
                });

                showToast("Sonarr rename triggered — file will be renamed shortly");

                // Update stored decision + re-render without the rename button
                const card = apiBtn.closest(".unm-file");
                const path = decodeURIComponent(card?.dataset.path ?? "");
                if (card && path && panel._sid) {
                    const allDecs  = loadDecisions(panel._sid);
                    const curDec   = allDecs[path];
                    if (curDec) {
                        const updatedDec = { ...curDec, sonarrRenamed: true };
                        saveDecision(panel._sid, path, updatedDec);
                        card.dataset.decision = "det-multipart";
                        swapWrap(card, renderDetectedDecisionWrap(
                            updatedDec, panel._epOpts,
                            parseInt(card.dataset.thisPart) || 1,
                            isAutoPairedCard(card),
                            getPairedInfoFromCard(card),
                        ));
                    }
                }
            } catch (err) {
                apiBtn.classList.remove("spinning");
                apiBtn.classList.add("error");
                apiBtn.textContent = "✗ Error";
                console.warn("[RG Unmatched] API rename failed:", err.message);
                showToast(`Rename failed: ${err.message}`);
            }
            return;
        }

        // ── Copy to clipboard ─────────────────────────────────────────────────
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
        const card = e.target.closest(".unm-file");
        if (!card || !e.target.closest(".unm-pair-ep")) return;
        if (isDetectedCard(card)) tryUpdateDetRename(card);
        else                      tryUpdateRename(card);
    });
}
