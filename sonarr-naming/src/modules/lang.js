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

/**
 * Map a language name/code to a 2-char ISO 639-1 code, or "" if unknown.
 *
 * Resolution order:
 *   1. LANG_NAME_MAP  — ISO 639-2/T three-letter codes  (e.g. "tha" → "TH", "kor" → "KO")
 *   2. LANGS labels   — full English names               (e.g. "Korean" → "KO")
 *   3. ISO 639-1      — two-letter codes already in LANGS (e.g. "th" → "TH", "ko" → "KO")
 *
 * Sonarr's mediaInfo.subtitles sometimes uses 2-letter codes ("th", "en")
 * and sometimes 3-letter codes ("tha", "eng") — all three cases are covered.
 */
export function mapLangNameToCode(name) {
    const lower = name?.toLowerCase().trim() ?? "";
    if (!lower) return "";
    // 1. ISO 639-2 three-letter codes
    if (LANG_NAME_MAP[lower]) return LANG_NAME_MAP[lower];
    // 2. Full English names ("Korean", "Thai", …)
    const byLabel = LANGS.find(l => l.label.toLowerCase() === lower);
    if (byLabel) return byLabel.value;
    // 3. ISO 639-1 two-letter codes — identical to our output codes, just lowercase
    if (lower.length === 2) {
        const upper = lower.toUpperCase();
        if (LANGS.some(l => l.value === upper)) return upper;
    }
    return "";
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
 * Sort AUDIO codes by priority: TH → EN → originalCode → (others excluded).
 * The original language is included only when it is physically detected in the file.
 * Random extra languages (e.g. Indonesian for a Korean series) are dropped.
 *
 * @param {string[]} codes        - deduplicated 2-letter codes from parseLangString
 * @param {string}   originalCode - 2-letter code of the series' original language
 */
export function sortAudioCodes(codes, originalCode) {
    const PRIORITY = ["TH", "EN"];
    const result   = PRIORITY.filter(c => codes.includes(c));
    // Add the series original language only when it is actually in the file's tracks.
    if (originalCode && !PRIORITY.includes(originalCode) && codes.includes(originalCode)) {
        result.push(originalCode);
    }
    return result.slice(0, 3);
}

/**
 * Sort SUBTITLE codes by priority: TH → EN → originalCode → (others excluded).
 * The original language is included only when it is actually detected in the file's
 * subtitle tracks — never force-added. Use only what MediaInfo reports.
 *
 * @param {string[]} codes        - deduplicated 2-letter codes from parseLangString
 * @param {string}   originalCode - 2-letter code of the series' original language
 */
export function sortSubCodes(codes, originalCode) {
    const PRIORITY = ["TH", "EN"];
    const result   = PRIORITY.filter(c => codes.includes(c));
    // Add original language only when it is actually present in the subtitle tracks.
    if (originalCode && !PRIORITY.includes(originalCode) && codes.includes(originalCode)) {
        result.push(originalCode);
    }
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

    // Audio: TH → EN → originalCode (only when physically detected in file)
    audioCodes = sortAudioCodes(audioCodes, originalCode);
    // Subtitle: TH → EN → originalCode (always guaranteed — streaming platforms
    // almost always include the original-language sub even if MediaInfo missed it)
    subCodes   = sortSubCodes(subCodes, originalCode);

    if (!audioCodes.length && !subCodes.length) return null;
    return { audioCodes, subCodes };
}
