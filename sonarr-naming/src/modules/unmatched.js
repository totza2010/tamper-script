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

/** Extract version number from filename: [VER2] / -ver2- / _VER2_ etc. */
function extractVersionNum(filename) {
    const m = filename.match(/\bver\s*(\d+)\b/i);
    return m ? parseInt(m[1]) : null;
}

/** Extract part format keyword from a filename ("part", "pt", "cd", …) */
function extractPartFormat(filename) {
    const m = filename.match(/(cd|disc|disk|dvd|part|pt)\s*\d+/i);
    return m ? m[1].toLowerCase() : "pt";
}

// ── Unified pair-token helpers ────────────────────────────────────────────────

/** True when token is a version token (ver1, ver2, …) */
function isVerToken(token) { return /^ver/i.test(token ?? ""); }

/**
 * Strip any existing pair indicator of the same type from a base filename.
 * – version tokens  → remove -[VERn] / -vern
 * – part tokens     → remove -(cd|disc|disk|dvd|part|pt)n
 */
function stripBaseToken(base, token) {
    if (isVerToken(token)) {
        return base
            .replace(/-\[VER\d+\]/gi, "")
            .replace(/-ver\d+/gi, "")
            .replace(/-{2,}/g, "-")
            .replace(/-$/, "");
    }
    return base
        .replace(/-(cd|disc|disk|dvd|part|pt)\d+/gi, "")
        .replace(/-{2,}/g, "-")
        .replace(/-$/, "");
}

/**
 * Strip an existing pair prefix from a release-group string.
 * e.g. "ver2-AudioJASubTH" → "AudioJASubTH"
 *      "part2-AudioJASubTHEN" → "AudioJASubTHEN"
 */
function stripRGToken(rg, token) {
    const s = (rg ?? "");
    const stripped = isVerToken(token)
        ? s.replace(/^ver\d+-?/i, "").replace(/^-/, "")
        : s.replace(/^(cd|disc|disk|dvd|part|pt)\d+-?/i, "").replace(/^-/, "");
    return stripped || s;
}

/**
 * Compute a rename target by inserting "-{token}" before the release group,
 * using the Sonarr episode file as the naming template.
 *
 * token examples: "pt1", "pt2", "part3", "cd2", "ver1", "ver2"
 */
function computePairTargetName(importedFile, token) {
    const { filename } = splitPath(importedFile.relativePath ?? "");
    if (!filename) return null;
    const dot  = filename.lastIndexOf(".");
    const ext  = dot >= 0 ? filename.slice(dot) : ".mkv";
    let base   = dot >= 0 ? filename.slice(0, dot) : filename;

    base = stripBaseToken(base, token);
    const baseRG = stripRGToken(importedFile.releaseGroup ?? "", token);

    if (baseRG) {
        const rgSuffix = `-${baseRG}`;
        if (base.toLowerCase().endsWith(rgSuffix.toLowerCase())) {
            return `${base.slice(0, base.length - rgSuffix.length)}-${token}-${baseRG}${ext}`;
        }
    }
    return `${base}-${token}${ext}`;
}

/**
 * Migrate a stored decision from old types to the unified "pair" type.
 * Returns the decision unchanged if it's already a current type.
 */
function migrateDecision(dec) {
    if (!dec) return null;
    const t = dec.type ?? "";

    // Already current types — pass through
    if (t === "pair" || t === "pair-picking" || t === "ignore" || t === "delete") return dec;

    // Old unmatched multipart (auto-saved, no Sonarr target)
    if (t === "multipart") {
        const pf = dec.partFormat ?? "pt";
        return {
            ...dec,
            type:           "pair",
            mode:           "part",
            thisToken:      `${pf}${dec.partNum ?? "?"}`,
            sonarrToken:    null,
            thisTargetName: dec.targetName ?? null,
        };
    }

    // Old version (with or without Sonarr target)
    if (t === "version") {
        const thisN   = dec.thisVerNum ?? dec.verNum;
        const sonarrN = dec.sonarrVerNum ?? null;
        return {
            ...dec,
            type:             "pair",
            mode:             "version",
            thisToken:        thisN   ? `ver${thisN}`   : null,
            sonarrToken:      sonarrN ? `ver${sonarrN}` : null,
            thisTargetName:   dec.thisTargetName ?? dec.targetName ?? null,
            sonarrTargetName: dec.sonarrTargetName ?? null,
            sonarrOriginalRG: dec.sonarrOriginalRG ?? null,
        };
    }

    // Old detected multipart
    if (t === "det-multipart") {
        const pf = dec.partFormat ?? "pt";
        return {
            ...dec,
            type:             "pair",
            mode:             "part",
            thisToken:        dec.thisPartNum  ? `${pf}${dec.thisPartNum}`   : null,
            sonarrToken:      dec.sonarrPartNum ? `${pf}${dec.sonarrPartNum}` : null,
            thisTargetName:   dec.thisTargetName   ?? null,
            sonarrTargetName: dec.sonarrTargetName ?? null,
            sonarrOriginalRG: dec.sonarrOriginalRG ?? null,
        };
    }

    // Old picking states — discard (will re-open as fresh picking)
    if (t === "multipart-picking" || t === "version-picking" || t === "det-picking") return null;

    return dec;
}

/**
 * Detect the effective file-pair mode ("part" | "version") from a decision.
 * Falls back to "part".
 */
function decMode(dec) {
    if (dec.mode) return dec.mode;
    if (dec.thisToken) return isVerToken(dec.thisToken) ? "version" : "part";
    return "part";
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

/**
 * Return a per-type classification breakdown for the given unmatched items.
 * Used by library-scan.js (exported so it doesn't need to import private helpers).
 *
 * Returns: { multipart, version, ignore, delete: del, unclassified }
 */
export function getBreakdown(seriesId, unmatchedItems) {
    const out = { multipart: 0, version: 0, ignore: 0, delete: 0, unclassified: 0 };
    try {
        const decisions = JSON.parse(GM_getValue(UNM_KEY(seriesId), "{}"));
        for (const item of unmatchedItems) {
            const p   = item.relativePath ?? item.path ?? "";
            const raw = p ? decisions[p] : null;
            const dec = migrateDecision(raw);

            if (dec != null) {
                const t = dec.type ?? "";
                if (t === "pair") {
                    decMode(dec) === "version" ? out.version++ : out.multipart++;
                } else if (t === "pair-picking") {
                    (dec.mode === "version") ? out.version++ : out.multipart++;
                } else if (t === "ignore")  { out.ignore++;      }
                else if  (t === "delete")   { out.delete++;      }
                else                        { out.unclassified++; }
            } else if (p && MULTI_PART_RE.test(splitPath(p).filename)) {
                out.multipart++;        // auto-detected by filename pattern
            } else {
                out.unclassified++;
            }
        }
    } catch { out.unclassified = unmatchedItems.length; }
    return out;
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

// ── Unified pair picking form ─────────────────────────────────────────────────

/**
 * Render the picking form shared by multi-part and multi-version pairing.
 *
 * @param {"part"|"version"} mode
 * @param {Array}  epOpts
 * @param {string} fmt          – token keyword, e.g. "pt", "part", "cd", "ver"
 * @param {number|null} defaultThisN   – pre-selected pill for "this file"
 * @param {number|null} defaultSonarrN – pre-selected pill for "Sonarr file"
 */
function renderPairPickingForm(mode, epOpts, fmt, defaultThisN, defaultSonarrN) {
    const isVer = mode === "version";
    const nums  = isVer ? [1, 2, 3, 4] : [1, 2, 3, 4, 5];
    const epHtml = epOpts.map(o =>
        `<option value="${o.fileId}">${esc(o.label)}</option>`
    ).join("");

    const pills = (defaultN) => nums.map(n => {
        const tok = `${fmt}${n}`;
        return `<button class="unm-part-pill${n === defaultN ? " active" : ""}" data-token="${tok}">${tok}</button>`;
    }).join("");

    const badge  = isVer ? "🔀 Multi-version" : "📼 Multi-part";
    const decCls = isVer ? "version" : "multipart";

    return `<div class="unm-decision-wrap">
        <div class="unm-decision unm-decision--${decCls}">
            <div class="unm-decision-head">
                <span class="unm-decision-badge">${badge}</span>
                <button class="unm-undo-btn" title="Cancel">× cancel</button>
            </div>
            <div class="unm-pair-form open">
                <div class="unm-pair-field">
                    <span class="unm-pair-lbl">Episode:</span>
                    <select class="unm-pair-ep">
                        <option value="">— select —</option>
                        ${epHtml}
                    </select>
                </div>
                <div class="unm-pair-field">
                    <span class="unm-pair-lbl">This file is:</span>
                    <div class="unm-part-pills" data-role="this">${pills(defaultThisN)}</div>
                </div>
                <div class="unm-pair-field">
                    <span class="unm-pair-lbl">Sonarr file is:</span>
                    <div class="unm-part-pills" data-role="sonarr">${pills(defaultSonarrN)}</div>
                </div>
                <!-- Preview appears here once all three fields are set -->
                <div class="unm-det-preview unm-rename--hidden"></div>
                <button class="unm-pair-confirm-btn" disabled>✓ Confirm</button>
            </div>
        </div>
    </div>`;
}

// ── Unified confirmed state ───────────────────────────────────────────────────

/**
 * Render the confirmed pair decision (for both part and version modes).
 * Handles old migrated decisions automatically via the dec object.
 */
function renderPairConfirmedState(dec, epOpts) {
    const ep    = epOpts.find(o => o.fileId === dec.episodeFileId);
    const epTag = ep
        ? `S${String(ep.sn).padStart(2,"0")}E${String(ep.ep).padStart(2,"0")}`
        : "";
    const isVer = decMode(dec) === "version";
    const icon  = isVer ? "🔀" : "📼";

    const thisToken   = dec.thisToken   ?? "";
    const sonarrToken = dec.sonarrToken ?? "";
    const badge = thisToken && epTag ? `${icon} ${thisToken} of ${epTag}`
                : thisToken          ? `${icon} ${thisToken}`
                : epTag              ? `${icon} ${isVer ? "version" : "part"} of ${epTag}`
                :                      `${icon} ${isVer ? "Multi-version" : "Multi-part"}`;

    const epTitle = ep?.label?.includes("—") ? ep.label.split("—").slice(1).join("—").trim() : "";
    const note    = epTag
        ? `Alternative ${isVer ? "version" : "part"} of ${epTag}${epTitle ? ` — ${epTitle}` : ""}.`
        : `An alternative ${isVer ? "version" : "part"} of the already-imported episode.`;

    const thisTarget   = dec.thisTargetName   ?? "";
    const sonarrTarget = dec.sonarrTargetName ?? "";

    // This file section — copy btn
    let thisSection = "";
    if (thisTarget) {
        if (dec.thisRenamed) {
            thisSection = `
            <div class="unm-rename-lbl" style="margin-top:6px">This file (${esc(thisToken)}):</div>
            <div class="unm-rename-row">
                <span class="unm-rename-target">${esc(thisTarget)}</span>
                <span class="unm-renamed-ok">✓ renamed</span>
            </div>`;
        } else {
            thisSection = `
            <div class="unm-rename-lbl" style="margin-top:6px">This file (${esc(thisToken)}) — copy &amp; rename manually:</div>
            <div class="unm-rename-row">
                <span class="unm-rename-target">${esc(thisTarget)}</span>
                <button class="unm-copy-btn" data-copy="${esc(thisTarget)}" title="Copy filename">📋</button>
            </div>`;
        }
    }

    // Sonarr file section — API rename btn
    let sonarrSection = "";
    if (sonarrTarget) {
        if (dec.sonarrRenamed) {
            sonarrSection = `
            <div class="unm-rename-lbl" style="margin-top:6px">Sonarr file (${esc(sonarrToken)}) — renamed:</div>
            <div class="unm-rename-row">
                <span class="unm-rename-target">${esc(sonarrTarget)}</span>
                <span class="unm-renamed-ok">✓ renamed</span>
            </div>`;
        } else {
            sonarrSection = `
            <div class="unm-rename-lbl" style="margin-top:6px">Sonarr file (${esc(sonarrToken)}) — rename via API:</div>
            <div class="unm-rename-row">
                <span class="unm-rename-target">${esc(sonarrTarget)}</span>
                <button class="unm-api-pair-rename-btn"
                    data-fileid="${dec.episodeFileId}"
                    data-token="${esc(sonarrToken)}"
                    data-rg="${esc(dec.sonarrOriginalRG ?? "")}"
                    title="Update release group and trigger Sonarr rename">↺ Rename</button>
            </div>`;
        }
    }

    const decCls = isVer ? "version" : "multipart";
    return `<div class="unm-decision-wrap">
        <div class="unm-decision unm-decision--${decCls}">
            <div class="unm-decision-head">
                <span class="unm-decision-badge">${badge}</span>
                <button class="unm-undo-btn">× undo</button>
            </div>
            <div class="unm-decision-note">${note}</div>
            ${thisSection}
            ${sonarrSection}
        </div>
    </div>`;
}

// ── Decision wraps ────────────────────────────────────────────────────────────

function renderDecisionWrap(dec, epOpts) {
    const d = migrateDecision(dec);

    if (!d) {
        return `<div class="unm-decision-wrap">
            <div class="unm-action-btns">
                <button class="unm-act unm-act--part"    data-action="multipart">📼 Multi-part</button>
                <button class="unm-act unm-act--version" data-action="version">🔀 Multi-version</button>
                <button class="unm-act unm-act--ignore"  data-action="ignore">👁 Ignore</button>
                <button class="unm-act unm-act--delete"  data-action="delete">🗑 Flag to delete</button>
            </div>
        </div>`;
    }

    if (d.type === "pair-picking") {
        const mode = d.mode ?? "part";
        const fmt  = mode === "version" ? "ver" : (d.tokenFormat ?? "pt");
        return renderPairPickingForm(mode, epOpts, fmt, d.defaultThisN ?? null, d.defaultSonarrN ?? null);
    }

    if (d.type === "pair") return renderPairConfirmedState(d, epOpts);

    const CFG = {
        ignore: { icon: "👁", label: "Ignored",        cls: "ignore", note: "" },
        delete: { icon: "🗑", label: "Flag to delete", cls: "delete",
                  note: "Remove this file from the series folder — it has no use here." },
    };
    const cfg = CFG[d.type] ?? CFG.ignore;
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

/**
 * @param {object|null} dec
 * @param {Array}       epOpts
 * @param {number}      thisPartNum  – auto-detected from the unmatched file's name
 * @param {boolean}     autoPaired   – true when the Sonarr-matched file already
 *                                     carries a Plex part indicator
 * @param {object|null} pairedInfo   – { thisFilename, pairFilename,
 *                                       thisPartLabel, pairPartLabel }
 */
function renderDetectedDecisionWrap(dec, epOpts, thisPartNum, autoPaired = false, pairedInfo = null) {
    const d = migrateDecision(dec);

    // ── No decision yet ───────────────────────────────────────────────────────
    if (!d) {
        if (autoPaired && pairedInfo) {
            // Already a valid Plex pair — show info + acknowledge button
            return `<div class="unm-decision-wrap">
                <div class="unm-decision unm-decision--multipart">
                    <div class="unm-decision-head">
                        <span class="unm-decision-badge">📼 ${esc(pairedInfo.thisPartLabel)} + ${esc(pairedInfo.pairPartLabel)}</span>
                        <button class="unm-undo-btn" title="Dismiss auto-detection">× undo</button>
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

    // ── Pair picking ──────────────────────────────────────────────────────────
    if (d.type === "pair-picking") {
        const fmt    = d.tokenFormat ?? "pt";
        const defN   = d.defaultThisN   ?? thisPartNum;
        const defS   = d.defaultSonarrN ?? (thisPartNum === 1 ? 2 : 1);
        return renderPairPickingForm("part", epOpts, fmt, defN, defS);
    }

    // ── Confirmed pair ────────────────────────────────────────────────────────
    if (d.type === "pair") return renderPairConfirmedState(d, epOpts);

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
    const d = migrateDecision(dec);
    const decType = d?.type ?? "";
    return `<div class="unm-file unm-file--pairable" data-path="${esc(encodeURIComponent(path))}" data-decision="${esc(decType)}">
        <div class="unm-filename">${esc(filename)}</div>
        ${folder ? `<div class="unm-folder">${esc(folder)}</div>` : ""}
        <div class="unm-row2">
            <div class="unm-chips">${chipRow(item)}</div>
            <div class="unm-eps"><span class="unm-ep-badge unm-ep-none">No episode match</span></div>
        </div>
        ${renderDecisionWrap(d, epOpts)}
    </div>`;
}

/**
 * @param {object}      item
 * @param {object|null} dec
 * @param {Array}       epOpts
 * @param {object|null} pairedFile  – when not null, the Sonarr file for the same
 *                                    episode already has a Plex part indicator.
 */
function buildDetectedCard(item, dec, epOpts, pairedFile) {
    const path = item.relativePath ?? item.path ?? "";
    const { filename, folder } = splitPath(path);
    const partLabel   = extractPartLabel(filename);
    const thisPartNum = extractPartNum(filename) ?? 1;
    const partFormat  = extractPartFormat(filename);   // "part" / "pt" / "cd" / …
    const autoPaired  = !!pairedFile;
    const d           = migrateDecision(dec);
    const decType     = d?.type ?? (autoPaired ? "auto-paired" : "");

    // Build pairedInfo for auto-paired cards
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
        ${renderDetectedDecisionWrap(d, epOpts, thisPartNum, autoPaired, pairedInfo)}
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
    if (!_spData?.series) return null;

    const { series } = _spData;
    const btn = document.getElementById("rg-unmatched-btn");

    try {
        const items = await apiReq("GET",
            `/api/v3/manualimport?seriesId=${series.id}` +
            `&folder=${encodeURIComponent(series.path)}` +
            `&filterExistingFiles=true&sortKey=relativePath&sortDirection=ascending`
        );

        _spData.unmatchedFiles = items;

        const unmatchedItems = items.filter(i => !(i.episodes?.length > 0));
        const count = unmatchedItems.length;

        // Full per-type breakdown (multipart / version / ignore / delete / unclassified)
        const breakdown   = count > 0 ? getBreakdown(series.id, unmatchedItems)
                                      : { multipart: 0, version: 0, ignore: 0, delete: 0, unclassified: 0 };
        const unclassified = breakdown.unclassified;
        const allHandled   = count > 0 && unclassified === 0;

        if (btn) {
            if (count > 0) {
                btn.classList.add("visible", "has-unmatched");
                btn.dataset.count = count;
                btn.title = `${count} file${count > 1 ? "s" : ""} with no episode match`;
            } else {
                btn.classList.remove("visible", "has-unmatched");
                delete btn.dataset.count;
            }
        }

        return { series, count, allHandled, unclassified, breakdown };
    } catch (e) {
        console.warn("[RG Unmatched]", e.message);
        return null;
    }
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

    const unmCards = unmatched.map(i =>
        buildUnmatchedCard(i, decisions[i.relativePath ?? i.path ?? ""] ?? null, epOpts));

    const detCards = detectedPart.map(i => {
        const pairedFile = detectPairedFile(i, files, epMap);
        const iPath = i.relativePath ?? i.path ?? "";
        let rawDec = decisions[iPath] ?? null;

        // Auto-detect: if Sonarr file was already renamed, mark sonarrRenamed
        const mig = migrateDecision(rawDec);
        if (mig?.type === "pair" && !mig.sonarrRenamed && mig.sonarrTargetName) {
            const sonarrFile = files.find(f => f.id === mig.episodeFileId);
            if (sonarrFile) {
                const { filename: sfn } = splitPath(sonarrFile.relativePath ?? "");
                if (sfn === mig.sonarrTargetName) {
                    rawDec = { ...mig, sonarrRenamed: true };
                    if (sid) saveDecision(sid, iPath, rawDec);
                }
            }
        }

        return buildDetectedCard(i, rawDec, epOpts, pairedFile);
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

    // ── In-memory temp store for picking preview values ───────────────────────
    // Keyed by card path; cleared when confirmed or cancelled.
    const pairPickTemp = new Map();

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

    // ── Unified pair rename preview (both modes, both card types) ─────────────
    function tryUpdatePairRename(card) {
        const select       = card.querySelector(".unm-pair-ep");
        const thisPills    = card.querySelector(".unm-part-pills[data-role='this']");
        const sonarrPills  = card.querySelector(".unm-part-pills[data-role='sonarr']");
        const activeThis   = thisPills?.querySelector(".unm-part-pill.active");
        const activeSonarr = sonarrPills?.querySelector(".unm-part-pill.active");
        const preview      = card.querySelector(".unm-det-preview");
        const confirmBtn   = card.querySelector(".unm-pair-confirm-btn");

        const fileId       = parseInt(select?.value);
        const thisToken    = activeThis?.dataset.token   ?? null;
        const sonarrToken  = activeSonarr?.dataset.token ?? null;

        if (!fileId || !thisToken || !sonarrToken) {
            preview?.classList.add("unm-rename--hidden");
            confirmBtn?.setAttribute("disabled", "");
            return;
        }

        const opt = panel._epOpts.find(o => o.fileId === fileId);
        if (!opt) return;

        const thisTarget   = computePairTargetName(opt.file, thisToken);
        const sonarrTarget = computePairTargetName(opt.file, sonarrToken);
        if (!thisTarget || !sonarrTarget) return;

        const sonarrOriginalRG = stripRGToken(opt.file.releaseGroup ?? "", sonarrToken);

        const path = decodeURIComponent(card.dataset.path ?? "");
        pairPickTemp.set(path, { fileId, thisToken, sonarrToken, thisTarget, sonarrTarget, sonarrOriginalRG });

        if (preview) {
            preview.classList.remove("unm-rename--hidden");
            preview.innerHTML = `
                <div class="unm-rename-lbl">This file — copy &amp; rename manually:</div>
                <div class="unm-rename-row">
                    <span class="unm-rename-target">${esc(thisTarget)}</span>
                    <button class="unm-copy-btn" data-copy="${esc(thisTarget)}" title="Copy filename">📋</button>
                </div>
                <div class="unm-rename-lbl" style="margin-top:5px">Sonarr file (${esc(sonarrToken)}) — rename via API:</div>
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
                // Unmatched card → multi-part picking (format "pt")
                card.dataset.decision = "pair-picking";
                swapWrap(card, renderDecisionWrap(
                    { type: "pair-picking", mode: "part", tokenFormat: "pt" }, panel._epOpts,
                ));
            } else if (action === "version") {
                // Unmatched card → multi-version picking
                // Auto-detect version number from the unmatched file's name
                const cardFilename = card.querySelector(".unm-filename")?.textContent ?? "";
                const autoVer = extractVersionNum(cardFilename);
                card.dataset.decision = "pair-picking";
                swapWrap(card, renderDecisionWrap(
                    { type: "pair-picking", mode: "version", defaultThisN: autoVer }, panel._epOpts,
                ));
            } else if (action === "det-pair") {
                // Detected card → part picking (use file's format keyword)
                const thisPartNum = parseInt(card.dataset.thisPart) || 1;
                const partFormat  = card.dataset.partFormat ?? "pt";
                card.dataset.decision = "pair-picking";
                swapWrap(card, renderDetectedDecisionWrap(
                    { type: "pair-picking", mode: "part", tokenFormat: partFormat,
                      defaultThisN: thisPartNum, defaultSonarrN: thisPartNum === 1 ? 2 : 1 },
                    panel._epOpts, thisPartNum, false,
                ));
            } else {
                // ignore / delete / acknowledge
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

        // ── Confirm pair button ───────────────────────────────────────────────
        const confirmBtn = e.target.closest(".unm-pair-confirm-btn");
        if (confirmBtn && !confirmBtn.disabled) {
            const card = confirmBtn.closest(".unm-file");
            const path = decodeURIComponent(card.dataset.path ?? "");
            const temp = pairPickTemp.get(path);
            if (!temp) return;

            const mode = isVerToken(temp.thisToken) ? "version" : "part";
            const dec  = {
                type:             "pair",
                mode,
                episodeFileId:    temp.fileId,
                thisToken:        temp.thisToken,
                sonarrToken:      temp.sonarrToken,
                thisTargetName:   temp.thisTarget,
                sonarrTargetName: temp.sonarrTarget,
                sonarrOriginalRG: temp.sonarrOriginalRG,
            };
            if (panel._sid) saveDecision(panel._sid, path, dec);
            pairPickTemp.delete(path);
            card.dataset.decision = "pair";

            if (isDetectedCard(card)) {
                swapWrap(card, renderDetectedDecisionWrap(
                    dec, panel._epOpts,
                    parseInt(card.dataset.thisPart) || 1,
                    isAutoPairedCard(card),
                    getPairedInfoFromCard(card),
                ));
            } else {
                swapWrap(card, renderDecisionWrap(dec, panel._epOpts));
            }
            return;
        }

        // ── Part / version pill ───────────────────────────────────────────────
        const pill = e.target.closest(".unm-part-pill");
        if (pill) {
            // Deactivate siblings in the same group
            const pillGroup = pill.closest(".unm-part-pills");
            pillGroup?.querySelectorAll(".unm-part-pill")
                .forEach(p => p.classList.remove("active"));
            pill.classList.add("active");
            tryUpdatePairRename(pill.closest(".unm-file"));
            return;
        }

        // ── Undo / cancel ─────────────────────────────────────────────────────
        const undoBtn = e.target.closest(".unm-undo-btn");
        if (undoBtn) {
            const card = undoBtn.closest(".unm-file");
            const path = decodeURIComponent(card.dataset.path ?? "");
            if (panel._sid) clearDecision(panel._sid, path);
            pairPickTemp.delete(path);
            if (isDetectedCard(card)) {
                const thisPartNum = parseInt(card.dataset.thisPart) || 1;
                card.dataset.decision = "";
                // Undo always collapses to the bare "Pair / Ignore" buttons
                // (dismiss auto-paired state too so user can handle manually)
                swapWrap(card, renderDetectedDecisionWrap(
                    null, panel._epOpts, thisPartNum, false, null,
                ));
            } else {
                card.dataset.decision = "";
                swapWrap(card, renderDecisionWrap(null, panel._epOpts));
            }
            return;
        }

        // ── API pair rename button ────────────────────────────────────────────
        const apiBtn = e.target.closest(".unm-api-pair-rename-btn");
        if (apiBtn && !apiBtn.classList.contains("spinning") && !apiBtn.classList.contains("done")) {
            const fileId = parseInt(apiBtn.dataset.fileid);
            const token  = apiBtn.dataset.token ?? "";
            const origRG = apiBtn.dataset.rg    ?? "";
            if (!fileId || !token) return;

            apiBtn.classList.add("spinning");
            apiBtn.textContent = "…";

            try {
                const spd = getSpData();
                // New RG: "{token}-{baseRG}" e.g. "pt2-AudioJASubTHEN" or "ver2-AudioJASubTH"
                const newRG = origRG ? `${token}-${origRG}` : token;

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
                    const curDec = loadDecisions(panel._sid)[path];
                    if (curDec) {
                        const updatedDec = { ...curDec, sonarrRenamed: true };
                        saveDecision(panel._sid, path, updatedDec);
                        card.dataset.decision = "pair";
                        if (isDetectedCard(card)) {
                            swapWrap(card, renderDetectedDecisionWrap(
                                updatedDec, panel._epOpts,
                                parseInt(card.dataset.thisPart) || 1,
                                isAutoPairedCard(card),
                                getPairedInfoFromCard(card),
                            ));
                        } else {
                            swapWrap(card, renderDecisionWrap(updatedDec, panel._epOpts));
                        }
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
        if (!card) return;
        // Episode picker — update pair rename preview for any picking form
        if (e.target.closest(".unm-pair-ep")) {
            tryUpdatePairRename(card);
        }
    });
}
