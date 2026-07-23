import { NETWORKS, EDITIONS, RG_PREFIX_RE, RG_TOKEN_RE, LANG_PINNED } from "./constants.js";

/**
 * Pin the primary languages (TH, EN) to the front regardless of pick order,
 * keeping every other selected language in the order it was chosen. Nothing is
 * dropped — this is ordering only. e.g. ["TH","TL","EN"] → ["TH","EN","TL"].
 */
function orderLangCodes(codes) {
    const head = LANG_PINNED.filter(c => codes.includes(c));
    const tail = codes.filter(c => !LANG_PINNED.includes(c));
    return [...head, ...tail];
}

// ── Multi-part / multi-version token ──────────────────────────────────────────
//
// The multi-part / multi-version indicator is now a BRACKET entry, exactly like
// a network — "[PT1]" / "[V1]" — so Sonarr matches it as a Custom Format
// (rendering ".PT1." in the filename for Plex to stack on) and the strip system
// removes it from the Release Group like any other prefix bracket.
//
//   "[NF][PT1]-EN.TH"   networks + part + language
//   "[PT1]-EN.TH"       part + language
//
// Canonical tokens: part → PT1…PT5, version → V1…V4.

const MULTI_RE = /^(cd|disc|disk|dvd|part|pt|ver|v)(\d+)$/i;

/**
 * Normalise any part/version spelling to its canonical bracket value.
 * "part1"/"pt1"/"cd1"/"PT1" → "PT1";  "ver2"/"v2"/"V2" → "V2";  else null.
 */
export function normalizeMulti(token) {
    const m = String(token ?? "").match(MULTI_RE);
    if (!m) return null;
    const kind = m[1].toLowerCase();
    return (kind === "ver" || kind === "v") ? `V${m[2]}` : `PT${m[2]}`;
}

/**
 * Split a Release Group into prefix + a LEGACY leading token + body. Kept only
 * to still read files named the old way ("[NF]-part1-EN.TH"); new output puts
 * the token in the bracket prefix instead.
 */
export function splitRG(raw) {
    const s  = raw ?? "";
    const pm = s.match(RG_PREFIX_RE);
    const prefix      = pm ? pm[0] : "";
    const afterPrefix = pm ? s.slice(pm[0].length) : s;
    const tm = afterPrefix.match(RG_TOKEN_RE);
    return {
        prefix,
        token: tm ? tm[1].toLowerCase() : null,
        body:  tm ? afterPrefix.slice(tm[0].length) : afterPrefix,
    };
}

/** Strip the [bracket] prefix (which now includes any [PT1]/[V1] token). */
export function stripRGPrefix(raw) {
    return (raw ?? "").replace(RG_PREFIX_RE, "");
}

/** Set (token) / remove (null) the part-version token, rebuilding the RG. */
export function withRGToken(raw, token) {
    const p = parseRG(raw);
    return buildValue(p.networks, p.editions, p.audioCodes, p.subCodes, token);
}

// ── Parse existing Release Group ──────────────────────────────────────────────

export function parseRG(raw) {
    // Supported prefix formats (both produced by Sonarr or by this script):
    //   A) Multiple brackets : [TrueID][NANA][Extended]-…   ← our output
    //   B) Space-separated   : [TrueID NANA Extended]-…     ← Sonarr {[Custom Formats]}
    //   C) No prefix         : …
    // Any of these may carry a multi-part token after the prefix: [NF]-part2-…
    //
    // The language body comes in two encodings, both read here:
    //   new : "THENJA.THEN"        audio.sub — the {.[Release Group]} token wraps
    //                              it in [] in the filename
    //   old : "AudioTHENJASubTHEN" AudioXX…SubYY…

    const { prefix: prefixStr, token: legacyToken, body } = splitRG(raw);

    // Collect bracket content only from the prefix region (not from body)
    const brackets = [...prefixStr.matchAll(/\[([^\]]+)\]/g)].map(m => m[1]);

    let audioCodes = [], subCodes = [];
    if (/Audio|Sub/.test(body)) {
        // Old encoding — keyed by the literal "Audio"/"Sub" markers.
        const audioM = body.match(/Audio([A-Z]{2}(?:[A-Z]{2})*)/);
        const subM   = body.match(/Sub([A-Z]{2}(?:[A-Z]{2})*)/);
        audioCodes = audioM ? (audioM[1].match(/.{2}/g) ?? []) : [];
        subCodes   = subM   ? (subM[1].match(/.{2}/g)  ?? []) : [];
    } else if (body) {
        // New encoding — "<audio>.<sub>", either side may be empty (".THEN").
        const dot = body.indexOf(".");
        const audioStr = dot >= 0 ? body.slice(0, dot) : body;
        const subStr   = dot >= 0 ? body.slice(dot + 1) : "";
        audioCodes = audioStr.match(/[A-Z]{2}/g) ?? [];
        subCodes   = subStr.match(/[A-Z]{2}/g)   ?? [];
    }

    // Expand each bracket entry: split on spaces to handle format B
    // e.g. "TrueID NANA Extended" → ["TrueID","NANA","Extended"]
    const tokens = brackets.flatMap(b => b.split(/\s+/).filter(Boolean));

    const networks = [], editions = [];
    let token = null;
    tokens.forEach(t => {
        const nm = normalizeMulti(t);
        if (nm)                                                     token = nm;
        else if (NETWORKS.find(n => n.value === t || n.label === t)) networks.push(t);
        else if (EDITIONS.find(e => e.value === t || e.label === t)) editions.push(t);
    });
    // Fall back to a legacy leading token ("[NF]-part1-…") from old files.
    if (!token && legacyToken) token = normalizeMulti(legacyToken);

    return {
        token,      // canonical "PT2" | "V1" | null
        networks,   // e.g. ["TrueID","NANA"]
        editions,   // e.g. ["Extended"]
        audioCodes, // e.g. ["TH","EN","JA"]
        subCodes,   // e.g. ["TH","EN"]
    };
}

// ── Build output string ───────────────────────────────────────────────────────

// networks & editions are arrays; audioCodes & subCodes are arrays of 2-char codes.
// The part/version `token` (any spelling) is normalised to PT#/V# and appended
// to the bracket prefix — "[NF][PT1]-THENJA.THEN" — so it behaves like a network
// and the strip system removes it. Language body is "<audio>.<sub>".
export function buildValue(networks, editions, audioCodes, subCodes, token = null) {
    const brackets = [...networks, ...editions];
    const multi = normalizeMulti(token);
    if (multi) brackets.push(multi);
    const prefix = brackets.map(v => `[${v}]`).join("");

    // Subtitles never appear without audio, so a body is either "<audio>" or
    // "<audio>.<sub>". Primary languages (TH, EN) are pinned to the front.
    const audio = orderLangCodes(audioCodes).join("");
    const sub   = orderLangCodes(subCodes).join("");
    const lang  = audio ? (sub ? `${audio}.${sub}` : audio) : "";

    if (!prefix && !lang) return "";
    if (!prefix) return lang;
    return `${prefix}-${lang}`;
}

/**
 * Returns true if this file needs an RG suggestion: no audio/sub language is
 * present in the Release Group (either encoding).
 */
export function needsRGSuggestion(file) {
    const p = parseRG(file.releaseGroup ?? "");
    return p.audioCodes.length === 0 && p.subCodes.length === 0;
}
