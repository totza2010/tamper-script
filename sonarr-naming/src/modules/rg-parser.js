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
// Layout: [bracket prefix] - [partN token] - [language body]
//   "[NF]-part1-AudioENSubTHEN"   prefix + token + body
//   "[NF]-AudioENSubTHEN"         prefix + body
//   "part1-AudioENSubTHEN"        token + body   (no network/edition)
//
// Keeping the bracket prefix in front means RG_PREFIX_RE still matches, so the
// strip-prefix features need no token awareness at all.

/**
 * Split a Release Group into its three segments.
 * "[NF]-part2-AudioTH" → { prefix: "[NF]-", token: "part2", body: "AudioTH" }
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

/** Strip the [bracket] prefix. The token sits after it, so it survives. */
export function stripRGPrefix(raw) {
    return (raw ?? "").replace(RG_PREFIX_RE, "");
}

/** Replace (or insert, or with token=null remove) the partN/verN token. */
export function withRGToken(raw, token) {
    const { prefix, body } = splitRG(raw);
    if (!token) return prefix + body;
    return body ? `${prefix}${token}-${body}` : `${prefix}${token}`;
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

    const { prefix: prefixStr, token, body } = splitRG(raw);

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
    tokens.forEach(t => {
        if (NETWORKS.find(n => n.value === t || n.label === t))      networks.push(t);
        else if (EDITIONS.find(e => e.value === t || e.label === t)) editions.push(t);
    });

    return {
        token,      // e.g. "part2" | "ver1" | null
        networks,   // e.g. ["TrueID","NANA"]
        editions,   // e.g. ["Extended"]
        audioCodes, // e.g. ["TH","EN","JA"]
        subCodes,   // e.g. ["TH","EN"]
    };
}

// ── Build output string ───────────────────────────────────────────────────────

// networks & editions are arrays; audioCodes & subCodes are arrays of 2-char codes.
// Language body is the new "<audio>.<sub>" encoding (e.g. "THENJA.THEN"); the
// {.[Release Group]} naming token wraps it in [] in the filename.
// `token` (partN/verN) is placed between the bracket prefix and the language body
// so the prefix stays in front: "[NF]-part1-THENJA.THEN".
export function buildValue(networks, editions, audioCodes, subCodes, token = null) {
    const prefix = [...networks, ...editions].map(v => `[${v}]`).join("");

    // Subtitles never appear without audio, so a body is either "<audio>" or
    // "<audio>.<sub>" — no leading-dot / sub-only form. Primary languages
    // (TH, EN) are pinned to the front regardless of the order they were picked.
    const audio = orderLangCodes(audioCodes).join("");
    const sub   = orderLangCodes(subCodes).join("");
    const lang  = audio ? (sub ? `${audio}.${sub}` : audio) : "";

    const tail = [token, lang].filter(Boolean).join("-");
    if (!prefix && !tail) return "";
    if (!prefix) return tail;
    return `${prefix}-${tail}`;
}

/**
 * Returns true if this file needs an RG suggestion: no audio/sub language is
 * present in the Release Group (either encoding).
 */
export function needsRGSuggestion(file) {
    const p = parseRG(file.releaseGroup ?? "");
    return p.audioCodes.length === 0 && p.subCodes.length === 0;
}
