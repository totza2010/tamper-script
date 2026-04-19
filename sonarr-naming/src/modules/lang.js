import { LANG_NAME_MAP, LANG_PINNED, LANG_STATS_KEY, LANGS } from "./constants.js";

// ── Language helpers ──────────────────────────────────────────────────────────

export function loadLangStats() {
    try { return JSON.parse(GM_getValue(LANG_STATS_KEY, "{}")); } catch { return {}; }
}

export function incLangStat(code) {
    const s = loadLangStats();
    s[code] = (s[code] || 0) + 1;
    GM_setValue(LANG_STATS_KEY, JSON.stringify(s));
}

/**
 * Returns LANGS sorted by usage count (desc).
 * LANG_PINNED codes (TH, EN) are always first in declaration order.
 * Ties are broken by original LANGS array order.
 */
export function sortedLangs() {
    const s = loadLangStats();
    const pinned = LANG_PINNED.map(c => LANGS.find(l => l.value === c)).filter(Boolean);
    const rest   = LANGS
        .filter(l => !LANG_PINNED.includes(l.value))
        .sort((a, b) => (s[b.value] || 0) - (s[a.value] || 0));
    return [...pinned, ...rest];
}

/** Map a Sonarr mediaInfo language name to a 2-char ISO code, or "" if unknown. */
export function mapLangNameToCode(name) {
    return LANG_NAME_MAP[name?.toLowerCase().trim() ?? ""] ?? "";
}

/**
 * Split a Sonarr language string into 2-char codes.
 * Handles:
 *   "Thai / Korean"    → ["TH","KO"]  (full names, slash-separated)
 *   "eng/tha"          → ["EN","TH"]  (ISO 639-2, slash-separated)
 *   "eng/eng/tha/tha"  → ["EN","TH"]  (deduplicated)
 */
export function parseLangString(str) {
    if (!str) return [];
    const codes = str.split(/[/,]/).map(s => mapLangNameToCode(s)).filter(Boolean);
    return [...new Set(codes)]; // deduplicate while preserving order
}

/**
 * Sort language codes by priority: TH → EN → originalCode → (others excluded).
 * Only the three "sanctioned" slots are kept; random extra languages are dropped.
 *
 * @param {string[]} codes        - deduplicated 2-letter codes from parseLangString
 * @param {string}   originalCode - 2-letter code of the series' original language
 *                                  (e.g. "KO" for Korean). Pass "" to keep legacy
 *                                  "include any 3" behaviour (backwards compat).
 */
export function sortAudioCodes(codes, originalCode) {
    const PRIORITY = ["TH", "EN"];
    const result   = PRIORITY.filter(c => codes.includes(c));
    // Add the series original language as 3rd slot only if it's available in the
    // tracks AND it isn't already captured by the fixed priority list above.
    if (originalCode && !PRIORITY.includes(originalCode) && codes.includes(originalCode)) {
        result.push(originalCode);
    }
    // No other languages are included — they are not part of our naming convention.
    return result.slice(0, 3);
}

/**
 * Compute suggested RG language parts from a file's mediaInfo + languages.
 *
 * Two data sources (most reliable first):
 *   1. file.mediaInfo.audioLanguages / file.mediaInfo.subtitles
 *      — populated by MediaInfo scan (may be empty if scan wasn't run)
 *   2. file.languages  [{id, name}]
 *      — recorded by Sonarr at import time; always present when Sonarr
 *        knows the language (this is what the "Thai, Korean" table column shows)
 *
 * Note: Sonarr's mediaInfo uses `subtitles` (NOT `subtitleLanguages`) for the
 * subtitle language string.
 *
 * Returns {audioCodes, subCodes} or null if no usable language data.
 *
 * @param {object} file          - Sonarr episodefile object
 * @param {string} originalCode  - 2-letter code of the series' original language
 *                                 e.g. "KO" — used to pick the 3rd-priority slot
 */
export function suggestRGFromFile(file, originalCode) {
    let audioCodes = [];
    let subCodes   = [];

    // Source 1: mediaInfo (actual file analysis)
    const mi = file.mediaInfo;
    if (mi) {
        audioCodes = parseLangString(mi.audioLanguages ?? "");
        // Sonarr uses "subtitles" (not "subtitleLanguages") in the mediaInfo schema
        subCodes   = parseLangString(mi.subtitles ?? mi.subtitleLanguages ?? "");
    }

    // Source 2: file.languages [{id, name}]  — fallback when mediaInfo not scanned
    // (This is what Sonarr records at import time, and what the table column shows)
    if (!audioCodes.length && Array.isArray(file.languages) && file.languages.length) {
        audioCodes = [...new Set(
            file.languages.map(l => mapLangNameToCode(l.name ?? "")).filter(Boolean)
        )];
    }

    // Apply priority ordering: TH → EN → series original language (max 3)
    // Random other languages (e.g. Indonesian for a Korean series) are excluded.
    audioCodes = sortAudioCodes(audioCodes, originalCode);
    subCodes   = sortAudioCodes(subCodes,   originalCode);

    if (!audioCodes.length && !subCodes.length) return null;
    return { audioCodes, subCodes };
}
