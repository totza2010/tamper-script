// ── Utility functions ─────────────────────────────────────────────────────────

/**
 * Format episode label from a single episode object or an array of episodes.
 * Multi-episode files show a range: S01E117-E119.
 */
export function fmtEp(ep) {
    const eps = Array.isArray(ep) ? ep : (ep ? [ep] : []);
    if (!eps.length) return "?";
    const pad   = n => String(n).padStart(2, "0");
    const first = eps[0];
    const last  = eps[eps.length - 1];
    const sn    = pad(first.seasonNumber);
    if (eps.length === 1) return `S${sn}E${pad(first.episodeNumber)}`;
    if (first.seasonNumber === last.seasonNumber)
        return `S${sn}E${pad(first.episodeNumber)}-E${pad(last.episodeNumber)}`;
    return `S${sn}E${pad(first.episodeNumber)}…`;
}

/** Return the first episode from an epMap value (array or single, may be null). */
export function firstEp(epVal) {
    return Array.isArray(epVal) ? (epVal[0] ?? null) : (epVal ?? null);
}

export function showToast(msg, ms = 3000) {
    document.getElementById("rg-toast")?.remove();
    const t = document.createElement("div");
    t.id = "rg-toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), ms);
}
