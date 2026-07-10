import { NETWORKS, EDITIONS, RG_PREFIX_RE, RG_TOKEN_RE } from "./constants.js";

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
    //   A) Multiple brackets : [TrueID][NANA][Extended]-AudioTH…   ← our output
    //   B) Space-separated   : [TrueID NANA Extended]-AudioTH…     ← Sonarr {[Custom Formats]}
    //   C) No prefix         : AudioTHZHSubTHENZH
    // Any of these may carry a multi-part token after the prefix: [NF]-part2-AudioTH…

    const { prefix: prefixStr, token, body } = splitRG(raw);

    // Collect bracket content only from the prefix region (not from body)
    const brackets = [...prefixStr.matchAll(/\[([^\]]+)\]/g)].map(m => m[1]);

    const audioM = body.match(/Audio([A-Z]{2}(?:[A-Z]{2})*)/);
    const subM   = body.match(/Sub([A-Z]{2}(?:[A-Z]{2})*)/);

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
        audioCodes: audioM ? (audioM[1].match(/.{2}/g) ?? []) : [],
        subCodes:   subM   ? (subM[1].match(/.{2}/g)  ?? []) : [],
    };
}

// ── Build output string ───────────────────────────────────────────────────────

// networks & editions are arrays; audioCodes & subCodes are arrays of 2-char codes.
// `token` (partN/verN) is placed between the bracket prefix and the language body
// so the prefix stays in front: "[NF]-part1-AudioENSubTHEN".
export function buildValue(networks, editions, audioCodes, subCodes, token = null) {
    const prefix = [...networks, ...editions].map(v => `[${v}]`).join("");
    const parts  = [];
    if (audioCodes.length) parts.push(`Audio${audioCodes.join("")}`);
    if (subCodes.length)   parts.push(`Sub${subCodes.join("")}`);
    const lang = parts.join("");

    const tail = [token, lang].filter(Boolean).join("-");
    if (!prefix && !tail) return "";
    if (!prefix) return tail;
    return `${prefix}-${tail}`;
}

/**
 * Returns true if this file needs an RG suggestion:
 * releaseGroup is empty OR does not contain "Audio".
 */
export function needsRGSuggestion(file) {
    return !(file.releaseGroup ?? "").includes("Audio");
}
