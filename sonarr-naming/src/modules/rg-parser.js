import { NETWORKS, EDITIONS, RG_PREFIX_RE } from "./constants.js";

// ── Parse existing Release Group ──────────────────────────────────────────────

export function parseRG(raw) {
    // Supported prefix formats (both produced by Sonarr or by this script):
    //   A) Multiple brackets : [TrueID][NANA][Extended]-AudioTH…   ← our output
    //   B) Space-separated   : [TrueID NANA Extended]-AudioTH…     ← Sonarr {[Custom Formats]}
    //   C) No prefix         : AudioTHZHSubTHENZH

    // Find the end of the prefix block = last "]-" that is followed immediately
    // by an uppercase letter (start of Audio/Sub body) or end of string.
    // Using RG_PREFIX_RE to extract the full matched prefix, then slice the body.
    const prefixMatch = raw.match(RG_PREFIX_RE);
    const body = prefixMatch ? raw.slice(prefixMatch[0].length) : raw;

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
        networks,   // e.g. ["TrueID","NANA"]
        editions,   // e.g. ["Extended"]
        audioCodes: audioM ? (audioM[1].match(/.{2}/g) ?? []) : [],
        subCodes:   subM   ? (subM[1].match(/.{2}/g)  ?? []) : [],
    };
}

// ── Build output string ───────────────────────────────────────────────────────

// networks & editions are now arrays; audioCodes & subCodes remain arrays of 2-char codes
export function buildValue(networks, editions, audioCodes, subCodes) {
    const prefix = [...networks, ...editions].map(v => `[${v}]`).join("");
    const parts  = [];
    if (audioCodes.length) parts.push(`Audio${audioCodes.join("")}`);
    if (subCodes.length)   parts.push(`Sub${subCodes.join("")}`);
    const lang = parts.join("");
    if (!prefix && !lang) return "";
    if (!prefix) return lang;
    return `${prefix}-${lang}`;
}

/**
 * Returns true if this file needs an RG suggestion:
 * releaseGroup is empty OR does not contain "Audio".
 */
export function needsRGSuggestion(file) {
    return !(file.releaseGroup ?? "").includes("Audio");
}
