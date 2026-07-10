import { NETWORKS, EDITIONS, RG_PREFIX_RE, RG_TOKEN_RE } from "./constants.js";

// ── Multi-part / multi-version token ──────────────────────────────────────────

/**
 * Split a leading multi-part/version token off a Release Group.
 * "part2-[NF]-AudioENSubTHEN" → { token: "part2", rest: "[NF]-AudioENSubTHEN" }
 * "[NF]-AudioENSubTHEN"       → { token: null,    rest: "[NF]-AudioENSubTHEN" }
 */
export function splitRGToken(raw) {
    const m = (raw ?? "").match(RG_TOKEN_RE);
    return m ? { token: m[1].toLowerCase(), rest: raw.slice(m[0].length) }
             : { token: null, rest: raw ?? "" };
}

/** Strip the [bracket] prefix while keeping any leading partN-/verN- token. */
export function stripRGPrefix(raw) {
    const { token, rest } = splitRGToken(raw);
    const stripped = rest.replace(RG_PREFIX_RE, "");
    return token ? `${token}-${stripped}` : stripped;
}

// ── Parse existing Release Group ──────────────────────────────────────────────

export function parseRG(raw) {
    // Supported prefix formats (both produced by Sonarr or by this script):
    //   A) Multiple brackets : [TrueID][NANA][Extended]-AudioTH…   ← our output
    //   B) Space-separated   : [TrueID NANA Extended]-AudioTH…     ← Sonarr {[Custom Formats]}
    //   C) No prefix         : AudioTHZHSubTHENZH
    // Any of these may carry a leading multi-part token: part2-[NF]-AudioTH…

    const { token, rest } = splitRGToken(raw);

    // Find the end of the prefix block = last "]-" that is followed immediately
    // by an uppercase letter (start of Audio/Sub body) or end of string.
    // Using RG_PREFIX_RE to extract the full matched prefix, then slice the body.
    const prefixMatch = rest.match(RG_PREFIX_RE);
    const body = prefixMatch ? rest.slice(prefixMatch[0].length) : rest;

    // Collect bracket content only from the prefix region (not from body)
    const prefixStr = prefixMatch ? prefixMatch[0] : "";
    const brackets  = [...prefixStr.matchAll(/\[([^\]]+)\]/g)].map(m => m[1]);

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
// `token` (partN/verN) is re-attached in front so multi-part files survive a rebuild.
export function buildValue(networks, editions, audioCodes, subCodes, token = null) {
    const prefix = [...networks, ...editions].map(v => `[${v}]`).join("");
    const parts  = [];
    if (audioCodes.length) parts.push(`Audio${audioCodes.join("")}`);
    if (subCodes.length)   parts.push(`Sub${subCodes.join("")}`);
    const lang = parts.join("");

    let body;
    if (!prefix && !lang) body = "";
    else if (!prefix)     body = lang;
    else                  body = `${prefix}-${lang}`;

    if (!token) return body;
    return body ? `${token}-${body}` : token;
}

/**
 * Returns true if this file needs an RG suggestion:
 * releaseGroup is empty OR does not contain "Audio".
 */
export function needsRGSuggestion(file) {
    return !(file.releaseGroup ?? "").includes("Audio");
}
